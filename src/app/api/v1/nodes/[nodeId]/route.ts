import { db } from '@/lib/db'
import { deriveNodeRuntimeState } from '@/lib/node-runtime'
import { getCurrentOperator, handleError, requireRole, audit, NotFoundError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

/** GET /api/v1/nodes/{node_id} — full node detail. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const { nodeId } = await params
    const node = await db.node.findUnique({
      where: { id: nodeId },
      include: {
        heartbeats: { orderBy: { received_at: 'desc' }, take: 20 },
        locations: { orderBy: { captured_at: 'desc' }, take: 10 },
        modules: true,
        node_events: { orderBy: { occurred_at: 'desc' }, take: 20 },
        capability_reports: { orderBy: { received_at: 'desc' }, take: 5 },
        incidents_sourced: { select: { id: true, category: true, status: true, priority: true, created_at: true }, take: 10 },
      },
    })
    if (!node) throw new NotFoundError()

    const hb = node.heartbeats[0]
    const runtime = deriveNodeRuntimeState({
      heartbeatReceivedAt: hb?.received_at,
      gatewayContactAt: node.last_gateway_contact_at,
      heartbeatHealthState: hb?.health_state,
      lifecycleState: node.lifecycle_state,
    })

    return Response.json({
      ...node,
      auth_secret: undefined, // never leak
      runtime_state: runtime.runtime_state,
      online: runtime.online,
      last_contact_at: runtime.last_contact_at?.toISOString() ?? null,
      last_contact_source: runtime.last_contact_source,
      latest_heartbeat: hb ?? null,
      latest_location: node.locations[0] ?? null,
      heartbeat_history: node.heartbeats,
      location_history: node.locations,
      events: node.node_events,
      capability_reports: node.capability_reports,
      incidents_sourced: node.incidents_sourced,
    })
  } catch (err) {
    return handleError(err)
  }
}

/** PATCH /api/v1/nodes/{node_id} — update display name / lifecycle / firmware. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const op = await requireRole('NODE_TECHNICIAN', 'ADMINISTRATOR')
    const { nodeId } = await params
    const body = await req.json().catch(() => ({}))

    const existing = await db.node.findUnique({ where: { id: nodeId } })
    if (!existing) throw new NotFoundError()

    const data: Record<string, unknown> = {}
    if (typeof body.display_name === 'string' && body.display_name.trim()) {
      data.display_name = body.display_name.trim()
    }
    if (typeof body.lifecycle_state === 'string') {
      const allowed = ['REGISTERED', 'DEPLOYED', 'MAINTENANCE', 'RETIRED']
      if (!allowed.includes(body.lifecycle_state)) {
        return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lifecycle_state.' } }, { status: 400 })
      }
      data.lifecycle_state = body.lifecycle_state
    }
    if (typeof body.firmware_version === 'string') data.firmware_version = body.firmware_version
    if (typeof body.protocol_version === 'string') data.protocol_version = body.protocol_version
    if (typeof body.hardware_revision === 'string') data.hardware_revision = body.hardware_revision

    const updated = await db.node.update({ where: { id: nodeId }, data })
    await audit({
      actor_id: op.id,
      action: 'node.update',
      entity_type: 'node',
      entity_id: nodeId,
      metadata: data,
    })
    return Response.json({
      node_id: updated.id,
      display_name: updated.display_name,
      lifecycle_state: updated.lifecycle_state,
      firmware_version: updated.firmware_version,
      protocol_version: updated.protocol_version,
      updated_at: updated.updated_at,
    })
  } catch (err) {
    return handleError(err)
  }
}
