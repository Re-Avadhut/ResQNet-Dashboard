import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'
import { deriveNodeRuntimeState } from '@/lib/node-runtime'

export const dynamic = 'force-dynamic'

/** GET /api/v1/overview — authorized overview metrics for the dashboard. */
export async function GET() {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }

    const now = new Date()
    const nodes = await db.node.findMany({
      include: {
        heartbeats: { orderBy: { received_at: 'desc' }, take: 1 },
      },
    })

    let online = 0
    let offline = 0
    let stale = 0
    let fault = 0
    const nodeHealth = nodes.map((n) => {
      const hb = n.heartbeats[0]
      const runtime = deriveNodeRuntimeState({
        now,
        heartbeatReceivedAt: hb?.received_at,
        gatewayContactAt: n.last_gateway_contact_at,
        heartbeatHealthState: hb?.health_state,
        lifecycleState: n.lifecycle_state,
      })
      if (runtime.runtime_state === 'online') online++
      else if (runtime.runtime_state === 'fault') fault++
      else if (runtime.runtime_state === 'stale') stale++
      else offline++

      return {
        id: n.id,
        display_name: n.display_name,
        lifecycle_state: n.lifecycle_state,
        runtime_state: runtime.runtime_state,
        online: runtime.online,
        health_state: hb?.health_state ?? 'UNKNOWN',
        last_heartbeat: hb?.received_at ?? null,
        last_contact_at: runtime.last_contact_at?.toISOString() ?? null,
        last_contact_source: runtime.last_contact_source,
        battery: hb?.battery ?? null,
        link_quality: hb?.link_quality ?? null,
        connected_clients: hb?.connected_clients ?? null,
        deployment_lat: n.deployment_lat,
        deployment_lon: n.deployment_lon,
        firmware_version: n.firmware_version,
      }
    })

    const incidents = await db.incident.findMany({
      include: { assignee: true, events: { orderBy: { created_at: 'desc' }, take: 1 } },
    })
    const newIncidents = incidents.filter((i) => i.status === 'NEW').length
    const unacknowledged = incidents.filter(
      (i) => i.status === 'NEW' || i.status === 'ACKNOWLEDGED',
    ).length - newIncidents + newIncidents // simpler: unacknowledged = NEW
    const inProgress = incidents.filter((i) =>
      ['ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'].includes(i.status),
    ).length
    const resolved = incidents.filter((i) => i.status === 'RESOLVED').length
    const critical = incidents.filter(
      (i) => i.priority === 'CRITICAL' && i.status !== 'RESOLVED',
    ).length

    // priority queue: CRITICAL > HIGH > MEDIUM > LOW, then by age
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const
    const priorityQueue = incidents
      .filter((i) => i.status !== 'RESOLVED' && i.status !== 'CANCELLED' && i.status !== 'DUPLICATE')
      .sort((a, b) => {
        const p = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (p !== 0) return p
        return a.created_at.getTime() - b.created_at.getTime()
      })
      .slice(0, 8)
      .map((i) => ({
        id: i.id,
        category: i.category,
        priority: i.priority,
        status: i.status,
        description: i.description,
        people_affected: i.people_affected,
        created_at: i.created_at,
        acknowledged_at: i.acknowledged_at,
        assigned_to: i.assignee?.display_name ?? null,
        location_lat: i.location_lat,
        location_lon: i.location_lon,
      }))

    // recent activity (last 10 events across incident_events, node_events, audit_logs)
    const [incidentEvents, nodeEvents, auditLogs] = await Promise.all([
      db.incidentEvent.findMany({
        take: 8,
        orderBy: { created_at: 'desc' },
        include: { incident: { select: { id: true, category: true } } },
      }),
      db.nodeEvent.findMany({
        take: 6,
        orderBy: { occurred_at: 'desc' },
        include: { node: { select: { id: true, display_name: true } } },
      }),
      db.auditLog.findMany({
        take: 6,
        orderBy: { timestamp: 'desc' },
      }),
    ])

    const recentActivity = [
      ...incidentEvents.map((e) => ({
        kind: 'incident' as const,
        id: e.id,
        event_type: e.event_type,
        entity_id: e.incident.id,
        entity_label: e.incident.category,
        note: e.note ?? null,
        timestamp: e.created_at.toISOString(),
        actor: e.actor_type,
      })),
      ...nodeEvents.map((e) => ({
        kind: 'node' as const,
        id: e.id,
        event_type: e.event_type,
        entity_id: e.node.id,
        entity_label: e.node.display_name,
        note: e.payload ?? null,
        severity: e.severity,
        timestamp: e.occurred_at.toISOString(),
        actor: 'node',
      })),
      ...auditLogs.map((e) => ({
        kind: 'audit' as const,
        id: e.id,
        event_type: e.action,
        entity_id: e.entity_id ?? null,
        entity_label: e.entity_type ?? null,
        note: e.metadata ?? null,
        timestamp: e.timestamp.toISOString(),
        actor: e.actor_type,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)

    // gateway health (best-effort, local-only estimates)
    const lastBackup = await db.systemEvent.findFirst({
      where: { event_type: 'backup.success' },
      orderBy: { occurred_at: 'desc' },
    })
    const gateway_health = {
      api_status: 'ok' as const,
      database_status: 'connected' as const,
      uptime_seconds: Math.floor(process.uptime()),
      last_backup_at: lastBackup?.occurred_at ?? null,
      storage_note: 'Local SD card; backup target documented separately.',
      clock_source: 'system' as const,
      server_time: now.toISOString(),
    }

    return Response.json({
      generated_at: now.toISOString(),
      operator: { id: op.id, display_name: op.display_name, role: op.role },
      network: {
        total_nodes: nodes.length,
        online,
        offline,
        stale,
        fault,
      },
      incidents: {
        total: incidents.length,
        new: newIncidents,
        unacknowledged: incidents.filter((i) => i.status === 'NEW').length,
        in_progress: inProgress,
        resolved,
        critical,
      },
      priority_queue: priorityQueue,
      node_health: nodeHealth,
      recent_activity: recentActivity,
      gateway_health,
      freshness: {
        last_updated_at: now.toISOString(),
        stale: false,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
