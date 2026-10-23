export type NodeContactSource = 'heartbeat' | 'gateway_report' | null
export type NodeRuntimeState = 'online' | 'offline' | 'stale' | 'fault'

type Timestamp = Date | string | null | undefined

type DeriveNodeRuntimeInput = {
  now?: Date
  heartbeatReceivedAt?: Timestamp
  gatewayContactAt?: Timestamp
  heartbeatHealthState?: string | null
  lifecycleState?: string | null
  freshnessMs?: number
}

export type DerivedNodeRuntime = {
  runtime_state: NodeRuntimeState
  online: boolean
  last_contact_at: Date | null
  last_contact_source: NodeContactSource
}

function toValidDate(value: Timestamp): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Device runtime is based on the freshest real gateway report or heartbeat.
 * Hardware health/battery/radio metrics still come only from heartbeats; a
 * sensor report does not fabricate those fields.
 */
export function deriveNodeRuntimeState(input: DeriveNodeRuntimeInput): DerivedNodeRuntime {
  const now = input.now ?? new Date()
  const freshnessMs = input.freshnessMs ?? 5 * 60_000
  const heartbeatAt = toValidDate(input.heartbeatReceivedAt)
  const gatewayAt = toValidDate(input.gatewayContactAt)
  const gatewayIsLatest =
    gatewayAt !== null &&
    (heartbeatAt === null || gatewayAt.getTime() >= heartbeatAt.getTime())
  const lastContactAt = gatewayIsLatest ? gatewayAt : heartbeatAt
  const lastContactSource: NodeContactSource =
    lastContactAt === null ? null : gatewayIsLatest ? 'gateway_report' : 'heartbeat'
  const contactAgeMs = lastContactAt === null ? Number.POSITIVE_INFINITY : now.getTime() - lastContactAt.getTime()
  const contactIsFresh = contactAgeMs >= 0 && contactAgeMs <= freshnessMs
  const heartbeatAgeMs = heartbeatAt === null ? Number.POSITIVE_INFINITY : now.getTime() - heartbeatAt.getTime()
  const heartbeatIsFresh = heartbeatAgeMs >= 0 && heartbeatAgeMs <= freshnessMs
  const heartbeatIsLatest = heartbeatAt !== null && (!gatewayAt || heartbeatAt.getTime() >= gatewayAt.getTime())
  const online = contactIsFresh && input.lifecycleState !== 'RETIRED'

  let runtime_state: NodeRuntimeState
  if (!online) runtime_state = 'offline'
  else if (heartbeatIsLatest && heartbeatIsFresh && input.heartbeatHealthState === 'FAULT') runtime_state = 'fault'
  else if (heartbeatIsLatest && heartbeatIsFresh && input.heartbeatHealthState === 'DEGRADED') runtime_state = 'stale'
  else runtime_state = 'online'

  return {
    runtime_state,
    online,
    last_contact_at: lastContactAt,
    last_contact_source: lastContactSource,
  }
}
