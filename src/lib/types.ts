// Shared API types for ResQNet dashboard.

export type OperatorRole =
  | 'VIEWER'
  | 'DISPATCHER'
  | 'FIELD_COORDINATOR'
  | 'NODE_TECHNICIAN'
  | 'ADMINISTRATOR'

export type SessionUser = {
  id: string
  username: string
  display_name: string
  role: OperatorRole
}

export type AuthMeResponse =
  | { authenticated: false }
  | { authenticated: true; user: SessionUser; active_sessions: number }

export type LoginResponse = {
  user: SessionUser
  expires_at: string
}

export type NodeLifecycle = 'REGISTERED' | 'DEPLOYED' | 'MAINTENANCE' | 'RETIRED'
export type RuntimeState = 'online' | 'offline' | 'stale' | 'fault'
export type NodeContactSource = 'heartbeat' | 'gateway_report' | null
export type ModuleStatus =
  | 'PRESENT_ONLINE'
  | 'PRESENT_DEGRADED'
  | 'PRESENT_OFFLINE'
  | 'NOT_DETECTED'
  | 'UNKNOWN'

export type NodeSummary = {
  id: string
  display_name: string
  lifecycle_state: NodeLifecycle
  runtime_state: RuntimeState
  online: boolean
  last_heartbeat: string | null
  last_contact_at: string | null
  last_contact_source: NodeContactSource
  battery: number | null
  supply_voltage: number | null
  link_quality: number | null
  uptime_seconds: number | null
  connected_clients: number | null
  rssi: number | null
  health_state: string
  firmware_version: string | null
  protocol_version: string | null
  hardware_revision: string | null
  deployment_lat: number | null
  deployment_lon: number | null
  deployment_locked_at: string | null
  module_summary: { type: string; status: ModuleStatus }[]
  created_at: string
}

export type NodeHeartbeat = {
  id: string
  node_id: string
  received_at: string
  node_reported_at: string
  battery: number | null
  supply_voltage: number | null
  link_quality: number | null
  uptime_seconds: number | null
  health_state: string
  connected_clients: number | null
  rssi: number | null
}

export type NodeLocation = {
  id: string
  node_id: string
  latitude: number
  longitude: number
  accuracy_m: number | null
  source: string
  captured_at: string
  received_at: string
  valid: boolean
}

export type NodeEvent = {
  id: string
  node_id: string
  event_type: string
  severity: string
  payload: string | null
  occurred_at: string
}

export type NodeCapabilityReport = {
  id: string
  node_id: string
  protocol_version: string
  firmware_version: string | null
  hardware_revision: string | null
  descriptor_json: string
  valid: boolean
  error_code: string | null
  received_at: string
}

export type NodeModule = {
  id: string
  node_id: string
  module_id: string
  module_type: string
  status: ModuleStatus
  capabilities: string
  firmware_version: string | null
  last_seen_at: string | null
  last_sample_json: string | null
  last_sample_received_at: string | null
}

export type NodeDetail = {
  id: string
  display_name: string
  hardware_revision: string | null
  firmware_version: string | null
  protocol_version: string | null
  lifecycle_state: NodeLifecycle
  deployment_lat: number | null
  deployment_lon: number | null
  deployment_locked_by: string | null
  deployment_locked_at: string | null
  deployment_accuracy_m: number | null
  created_at: string
  updated_at: string
  runtime_state: RuntimeState
  online: boolean
  last_contact_at: string | null
  last_contact_source: NodeContactSource
  latest_heartbeat: NodeHeartbeat | null
  latest_location: NodeLocation | null
  heartbeat_history: NodeHeartbeat[]
  location_history: NodeLocation[]
  events: NodeEvent[]
  capability_reports: NodeCapabilityReport[]
  modules: NodeModule[]
  incidents_sourced: {
    id: string
    category: IncidentCategory
    status: IncidentStatus
    priority: IncidentPriority
    created_at: string
  }[]
}

export type IncidentStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'DUPLICATE'
export type IncidentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentCategory =
  | 'RESCUE'
  | 'MEDICAL'
  | 'FIRE'
  | 'FLOOD'
  | 'STRUCTURE'
  | 'SUPPLY'
  | 'COMMUNICATION'
  | 'OTHER'

export type IncidentListItem = {
  id: string
  category: IncidentCategory
  priority: IncidentPriority
  status: IncidentStatus
  description: string
  people_affected: number | null
  source_type: string
  source_node_id: string | null
  source_node: { id: string; display_name: string } | null
  location_lat: number | null
  location_lon: number | null
  location_source: string | null
  location_accuracy_m: number | null
  location_captured_at: string | null
  created_at: string
  acknowledged_at: string | null
  assigned_at: string | null
  resolved_at: string | null
  assigned_to: { id: string; display_name: string; role: OperatorRole } | null
  latest_event: {
    event_type: string
    created_at: string
    actor_type: string
  } | null
}

export type IncidentEvent = {
  id: string
  event_type: string
  old_value: string | null
  new_value: string | null
  actor_type: string
  actor_id: string | null
  note: string | null
  created_at: string
}

export type IncidentNote = {
  id: string
  body: string
  author_id: string | null
  created_at: string
  author?: { display_name: string; role: OperatorRole } | null
}

export type IncidentDetail = {
  id: string
  client_submission_id: string | null
  category: IncidentCategory
  priority: IncidentPriority
  status: IncidentStatus
  description: string
  people_affected: number | null
  source_type: string
  source_node_id: string | null
  location_lat: number | null
  location_lon: number | null
  location_source: string | null
  location_accuracy_m: number | null
  location_captured_at: string | null
  created_at: string
  acknowledged_at: string | null
  assigned_at: string | null
  resolved_at: string | null
  updated_at: string
  assigned_to_id: string | null
  assigned_to?: { id: string; display_name: string; role: OperatorRole } | null
  assignee: { id: string; display_name: string; role: OperatorRole } | null
  source_node: { id: string; display_name: string } | null
  events: IncidentEvent[]
  notes: IncidentNote[]
}

export type OverviewResponse = {
  generated_at: string
  operator: { id: string; display_name: string; role: OperatorRole }
  network: {
    total_nodes: number
    online: number
    offline: number
    stale: number
    fault: number
  }
  incidents: {
    total: number
    new: number
    unacknowledged: number
    in_progress: number
    resolved: number
    critical: number
  }
  priority_queue: Array<{
    id: string
    category: IncidentCategory
    priority: IncidentPriority
    status: IncidentStatus
    description: string
    people_affected: number | null
    created_at: string
    acknowledged_at: string | null
    assigned_to: string | null
    location_lat: number | null
    location_lon: number | null
  }>
  node_health: Array<{
    id: string
    display_name: string
    lifecycle_state: NodeLifecycle
    online: boolean
    health_state: string
    last_heartbeat: string | null
    last_contact_at: string | null
    last_contact_source: NodeContactSource
    runtime_state: RuntimeState
    battery: number | null
    link_quality: number | null
    connected_clients: number | null
    deployment_lat: number | null
    deployment_lon: number | null
    firmware_version: string | null
    runtime_state: RuntimeState
  }>
  recent_activity: Array<{
    kind: 'incident' | 'node' | 'audit'
    id: string
    event_type: string
    entity_id: string | null
    entity_label: string | null
    note: string | null
    severity?: string
    timestamp: string
    actor: string
  }>
  gateway_health: {
    api_status: 'ok' | 'degraded' | 'down'
    database_status: 'connected' | 'unreachable'
    uptime_seconds: number
    last_backup_at: string | null
    storage_note: string
    clock_source: string
    server_time: string
  }
  freshness: { last_updated_at: string; stale: boolean }
}
