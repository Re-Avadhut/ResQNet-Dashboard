import { db } from '@/lib/db'
import { deriveNodeRuntimeState } from '@/lib/node-runtime'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/v1/nodes — filterable node inventory. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const status = url.searchParams.get('status') // online | offline | stale | fault
    const lifecycle = url.searchParams.get('lifecycle') // REGISTERED | DEPLOYED | MAINTENANCE | RETIRED
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 200))
    const now = new Date()

    const nodes = await db.node.findMany({
      where: {
        AND: [
          lifecycle ? { lifecycle_state: lifecycle as never } : {},
        ],
      },
      include: {
        heartbeats: { orderBy: { received_at: 'desc' }, take: 1 },
        modules: true,
      },
      take: limit,
      orderBy: { id: 'asc' },
    })

    const enriched = nodes.map((n) => {
      const hb = n.heartbeats[0]
      const runtime = deriveNodeRuntimeState({
        now,
        heartbeatReceivedAt: hb?.received_at,
        gatewayContactAt: n.last_gateway_contact_at,
        heartbeatHealthState: hb?.health_state,
        lifecycleState: n.lifecycle_state,
      })

      return {
        id: n.id,
        display_name: n.display_name,
        lifecycle_state: n.lifecycle_state,
        runtime_state: runtime.runtime_state,
        online: runtime.online,
        last_heartbeat: hb?.received_at ?? null,
        last_contact_at: runtime.last_contact_at?.toISOString() ?? null,
        last_contact_source: runtime.last_contact_source,
        battery: hb?.battery ?? null,
        supply_voltage: hb?.supply_voltage ?? null,
        link_quality: hb?.link_quality ?? null,
        uptime_seconds: hb?.uptime_seconds ?? null,
        connected_clients: hb?.connected_clients ?? null,
        rssi: hb?.rssi ?? null,
        health_state: hb?.health_state ?? 'UNKNOWN',
        firmware_version: n.firmware_version,
        protocol_version: n.protocol_version,
        hardware_revision: n.hardware_revision,
        deployment_lat: n.deployment_lat,
        deployment_lon: n.deployment_lon,
        deployment_locked_at: n.deployment_locked_at,
        module_summary: n.modules.map((m) => ({
          type: m.module_type,
          status: m.status,
        })),
        created_at: n.created_at,
      }
    })

    let filtered = enriched
    if (status && status !== 'all') {
      filtered = filtered.filter((n) => n.runtime_state === status)
    }
    if (q) {
      filtered = filtered.filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.display_name.toLowerCase().includes(q),
      )
    }

    return Response.json({
      nodes: filtered,
      total: filtered.length,
      freshness: { last_updated_at: new Date().toISOString(), stale: false },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/nodes — register a new node. Technician/Admin only. */
export async function POST(req: Request) {
  try {
    const op = await requireRole('NODE_TECHNICIAN', 'ADMINISTRATOR')
    const body = await req.json().catch(() => null)
    const id = String(body?.id ?? '').trim().toUpperCase()
    const display_name = String(body?.display_name ?? '').trim()
    const hardware_revision = body?.hardware_revision ? String(body.hardware_revision) : null
    const firmware_version = body?.firmware_version ? String(body.firmware_version) : null
    const protocol_version = body?.protocol_version ? String(body.protocol_version) : '1.0'
    const deployment_lat = body?.deployment_lat != null ? Number(body.deployment_lat) : null
    const deployment_lon = body?.deployment_lon != null ? Number(body.deployment_lon) : null

    if (!id || !display_name) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'id and display_name are required.' } },
        { status: 400 },
      )
    }
    if (await db.node.findUnique({ where: { id } })) {
      return Response.json(
        { error: { code: 'DUPLICATE', message: `Node ${id} already exists.` } },
        { status: 409 },
      )
    }

    // Generate per-node secret. Stored once, shown to operator only here.
    const auth_secret = crypto.randomUUID()

    const node = await db.node.create({
      data: {
        id,
        display_name,
        hardware_revision,
        firmware_version,
        protocol_version,
        auth_secret,
        lifecycle_state: 'REGISTERED',
        deployment_lat: deployment_lat && !Number.isNaN(deployment_lat) ? deployment_lat : null,
        deployment_lon: deployment_lon && !Number.isNaN(deployment_lon) ? deployment_lon : null,
        deployment_locked_by: op.id,
        deployment_locked_at: new Date(),
      },
    })

    await audit({
      actor_id: op.id,
      action: 'node.register',
      entity_type: 'node',
      entity_id: node.id,
      metadata: { display_name },
    })

    return Response.json(
      {
        node_id: node.id,
        display_name: node.display_name,
        auth_secret, // shown once for the technician to provision
        lifecycle_state: node.lifecycle_state,
        created_at: node.created_at,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
