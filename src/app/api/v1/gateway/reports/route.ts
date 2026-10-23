import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { handleError, ValidationError } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import {
  classifyPortalReport,
  normalizePortalReport,
  parseCsvRecord,
  parseResQnetTelemetry,
  peopleAffectedFromPortal,
} from '@/lib/resqnet-gateway'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_REQUEST_BYTES = 4096
const NODE_ID_PATTERN = /^[A-Z0-9-]{1,19}$/

function validGatewayToken(req: Request): boolean {
  const expected = process.env.RESQNET_GATEWAY_TOKEN ?? ''
  const authorization = req.headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!expected || !provided) return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

async function ensureSourceNode(sourceNodeId: string): Promise<void> {
  // Unknown origin nodes are registered with an unprovisioned secret that is never returned.
  await db.node.upsert({
    where: { id: sourceNodeId },
    create: {
      id: sourceNodeId,
      display_name: `ResQnet node ${sourceNodeId}`,
      hardware_revision: 'ESP32',
      firmware_version: 'ResQnet ESP-IDF',
      protocol_version: '1.0',
      auth_secret: randomUUID(),
      lifecycle_state: 'REGISTERED',
    },
    update: {},
  })
}

async function recordGatewayObservedContact(nodeId: string, observedAt: Date): Promise<void> {
  // A report has been observed from/via this node by the authenticated USB gateway.
  // This is contact evidence, not a synthetic heartbeat or proof of current radio reachability.
  await db.node.upsert({
    where: { id: nodeId },
    create: {
      id: nodeId,
      display_name: `ResQnet node ${nodeId}`,
      hardware_revision: 'ESP32',
      firmware_version: 'ResQnet ESP-IDF',
      protocol_version: '1.0',
      auth_secret: randomUUID(),
      lifecycle_state: 'REGISTERED',
      last_gateway_contact_at: observedAt,
    },
    update: { last_gateway_contact_at: observedAt },
  })
}

function buildDescription(
  report: NonNullable<ReturnType<typeof normalizePortalReport>>,
  gatewayNodeId: string,
  lastHopNodeId: string | null,
  lastHopRole: string | null,
): string {
  const parts = [report.type || 'Emergency report']
  if (report.name) parts.push(`Contact: ${report.name}`)
  if (report.emergency) parts.push(`Emergency: ${report.emergency}`)
  if (report.injuryLevel) parts.push(`Severity: ${report.injuryLevel}`)
  if (report.situation) parts.push(`Situation: ${report.situation}`)
  if (report.supplies) parts.push(`Supplies: ${report.supplies}`)
  if (report.details) parts.push(`Details: ${report.details}`)
  parts.push(`Received by gateway ${gatewayNodeId}`)
  if (lastHopNodeId) parts.push(`Last hop: ${lastHopNodeId}${lastHopRole ? ` (${lastHopRole})` : ''}`)
  return parts.join(' | ').slice(0, 2000)
}

/**
 * POST /api/v1/gateway/reports
 * ESP-4 submits a report only after receiving it from the ResQnet mesh.
 * The gateway bearer token is server-side configuration, never a browser value.
 */
export async function POST(req: Request) {
  try {
    if (!validGatewayToken(req)) {
      return Response.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Valid gateway bearer token required.' } },
        { status: 401 },
      )
    }

    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Gateway report is too large.' } },
        { status: 413 },
      )
    }

    const rawBody = await req.text()
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Gateway report is too large.' } },
        { status: 413 },
      )
    }
    let body: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(rawBody) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>
      }
    } catch {
      throw new ValidationError('A valid JSON report body is required.')
    }
    if (!body) throw new ValidationError('A JSON report body is required.')

    const gatewayNodeId = String(body.gateway_node_id ?? '').trim().toUpperCase()
    const sourceNodeId = String(body.source_node_id ?? '').trim().toUpperCase()
    const sequence = Number(body.sequence)
    const payload = typeof body.payload === 'string' ? body.payload : ''
    const lastHopCandidate = body.last_hop_node_id == null ? '' : String(body.last_hop_node_id).trim().toUpperCase()
    const lastHopRoleCandidate = body.last_hop_role == null ? '' : String(body.last_hop_role).trim().toUpperCase()

    if (!NODE_ID_PATTERN.test(gatewayNodeId) || !NODE_ID_PATTERN.test(sourceNodeId)) {
      throw new ValidationError('gateway_node_id and source_node_id must be valid ResQnet node IDs.')
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 0xffffffff) {
      throw new ValidationError('sequence must be an unsigned 32-bit integer greater than zero.')
    }
    if (!payload || Buffer.byteLength(payload, 'utf8') > 200) {
      throw new ValidationError('payload must contain the portal CSV report and be at most 200 bytes.')
    }

    const lastHopNodeId = NODE_ID_PATTERN.test(lastHopCandidate) ? lastHopCandidate : null
    const lastHopRole = /^[A-Z_]{1,32}$/.test(lastHopRoleCandidate) ? lastHopRoleCandidate : null

    // Sensor nodes send compact JSON telemetry through the same durable mesh queue.
    // Upsert the latest module state, rather than appending one database row every 5 seconds.
    if (payload.startsWith('{')) {
      const telemetry = parseResQnetTelemetry(payload)
      if (!telemetry) {
        throw new ValidationError('JSON payload must be valid ResQnet sensor telemetry.')
      }

      await ensureSourceNode(sourceNodeId)
      const now = new Date()
      const observedNodeIds = [...new Set([sourceNodeId, lastHopNodeId, gatewayNodeId].filter((id): id is string => id !== null))]
      await Promise.all(observedNodeIds.map((id) => recordGatewayObservedContact(id, now)))
      const gpsStatus = !telemetry.gpsSeen
        ? 'NOT_DETECTED' as const
        : telemetry.gpsFix ? 'PRESENT_ONLINE' as const : 'PRESENT_DEGRADED' as const
      const imuStatus = telemetry.imuPresent ? 'PRESENT_ONLINE' as const : 'NOT_DETECTED' as const
      const imuSample = telemetry.imuPresent
        ? JSON.stringify({
            moving: telemetry.moving,
            acceleration_mg: {
              x: telemetry.axMg,
              y: telemetry.ayMg,
              z: telemetry.azMg,
            },
            gyro_dps10: {
              x: telemetry.gxDps10,
              y: telemetry.gyDps10,
              z: telemetry.gzDps10,
            },
          })
        : null

      await db.module.upsert({
        where: { node_id_module_id: { node_id: sourceNodeId, module_id: 'gps' } },
        create: {
          node_id: sourceNodeId,
          module_id: 'gps',
          module_type: 'GPS',
          status: gpsStatus,
          capabilities: telemetry.gpsSeen ? 'nmea,location' : 'not_detected',
          firmware_version: 'resqnet-telemetry-v1',
          last_seen_at: telemetry.gpsSeen ? now : null,
        },
        update: {
          status: gpsStatus,
          capabilities: telemetry.gpsSeen ? 'nmea,location' : 'not_detected',
          firmware_version: 'resqnet-telemetry-v1',
          last_seen_at: telemetry.gpsSeen ? now : null,
        },
      })
      await db.module.upsert({
        where: { node_id_module_id: { node_id: sourceNodeId, module_id: 'imu' } },
        create: {
          node_id: sourceNodeId,
          module_id: 'imu',
          module_type: 'IMU',
          status: imuStatus,
          capabilities: telemetry.imuPresent ? 'accelerometer,gyroscope,motion' : 'not_detected',
          firmware_version: 'resqnet-telemetry-v1',
          last_seen_at: telemetry.imuPresent ? now : null,
          last_sample_json: imuSample,
          last_sample_received_at: telemetry.imuPresent ? now : null,
        },
        update: {
          status: imuStatus,
          capabilities: telemetry.imuPresent ? 'accelerometer,gyroscope,motion' : 'not_detected',
          firmware_version: 'resqnet-telemetry-v1',
          last_seen_at: telemetry.imuPresent ? now : null,
          last_sample_json: imuSample,
          last_sample_received_at: telemetry.imuPresent ? now : null,
        },
      })

      return Response.json({
        accepted: true,
        duplicate: false,
        telemetry: true,
        source_node_id: sourceNodeId,
        gateway_node_id: gatewayNodeId,
        sequence,
        modules_updated: 2,
        updated_at: now,
      })
    }

    const fields = parseCsvRecord(payload)
    const report = fields ? normalizePortalReport(fields) : null
    if (!report) {
      throw new ValidationError('payload must be a valid 12-field legacy or 13-field timestamped ResQnet portal CSV record.')
    }

    const peopleAffected = peopleAffectedFromPortal(report.peopleText)
    if (peopleAffected === undefined) {
      throw new ValidationError('The number of people affected is invalid.')
    }

    const { category, priority } = classifyPortalReport(report.type, report.injuryLevel)
    const clientSubmissionId = `${gatewayNodeId}:${sourceNodeId}:${sequence}`

    await ensureSourceNode(sourceNodeId)
    const reportReceivedAt = new Date()
    const observedNodeIds = [...new Set([sourceNodeId, lastHopNodeId, gatewayNodeId].filter((id): id is string => id !== null))]
    await Promise.all(observedNodeIds.map((id) => recordGatewayObservedContact(id, reportReceivedAt)))

    const existing = await db.incident.findFirst({
      where: { source_node_id: sourceNodeId, client_submission_id: clientSubmissionId },
      select: { id: true, status: true, created_at: true },
    })
    if (existing) {
      return Response.json( {
        accepted: true,
        duplicate: true,
        incident_id: existing.id,
        status: existing.status,
        created_at: existing.created_at,
      })
    }

    const incidentId = `SOS-${Date.now().toString(36).toUpperCase()}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`
    const description = buildDescription(report, gatewayNodeId, lastHopNodeId, lastHopRole)
    let incident
    try {
      incident = await db.incident.create({
        data: {
          id: incidentId,
          client_submission_id: clientSubmissionId,
          category,
          priority,
          status: 'NEW',
          description,
          people_affected: peopleAffected,
          source_type: 'resqnet_gateway',
          source_node_id: sourceNodeId,
          location_lat: report.locationAvailable ? report.latitude : null,
          location_lon: report.locationAvailable ? report.longitude : null,
          location_source: report.locationAvailable ? 'PHONE_GPS_COMPANION' : null,
          location_accuracy_m: report.locationAvailable ? report.accuracyM : null,
          location_captured_at: report.locationAvailable
            ? new Date(report.locationCapturedAtMs ?? Date.now())
            : null,
          events: {
            create: {
              event_type: 'created',
              actor_type: 'gateway',
              actor_id: gatewayNodeId,
              new_value: 'NEW',
              note: `Accepted by ResQnet gateway ${gatewayNodeId}${lastHopNodeId ? ` via ${lastHopNodeId}` : ''}.`,
            },
          },
        },
      })
    } catch (err) {
      // In case two copies of the same queued report arrive concurrently,
      // the composite unique constraint still makes retries idempotent.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const duplicate = await db.incident.findFirst({
          where: { source_node_id: sourceNodeId, client_submission_id: clientSubmissionId },
          select: { id: true, status: true, created_at: true },
        })
        if (duplicate) {
          return Response.json({
            accepted: true,
            duplicate: true,
            incident_id: duplicate.id,
            status: duplicate.status,
            created_at: duplicate.created_at,
          })
        }
      }
      throw err
    }

    await publishEvent({
      event_type: 'incident.created',
      entity_id: incident.id,
      data: {
        category: incident.category,
        priority: incident.priority,
        status: incident.status,
        source_node_id: sourceNodeId,
        source_type: incident.source_type,
      },
    })

    return Response.json({
      accepted: true,
      duplicate: false,
      incident_id: incident.id,
      status: incident.status,
      created_at: incident.created_at,
    }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
