import assert from 'node:assert/strict'
import test from 'node:test'
import { parseImuSample } from '../src/lib/imu-telemetry'
import { deriveNodeRuntimeState } from '../src/lib/node-runtime'
import {
  classifyPortalReport,
  normalizePortalReport,
  parseCsvRecord,
  peopleAffectedFromPortal,
  parseResQnetTelemetry,
} from '../src/lib/resqnet-gateway'

test('parses the 12-field captive-portal CSV including quoted commas and escaped quotes', () => {
  const parsed = parseCsvRecord('"Medical Emergency","A, B ""C""","1","Pregnancy emergency","Critical","","Water, medicine","need ""urgent"" help","false","","",""')
  assert.ok(parsed)
  if (!parsed) throw new Error('expected parsed CSV')
  assert.equal(parsed.length, 12)
  assert.equal(parsed[1], 'A, B "C"')
  assert.equal(parsed[6], 'Water, medicine')
  assert.equal(parsed[7], 'need "urgent" help')
})

test('rejects malformed CSV quoting and unexpected field counts', () => {
  assert.equal(parseCsvRecord('"Medical Emergency","unfinished'), null)
  assert.equal(normalizePortalReport(['Instant SOS']), null)
})

test('maps a phone medical report into validated portal fields', () => {
  const fields = parseCsvRecord('"Medical Emergency","Demo","4+","Severe bleeding","Critical","Trapped but safe","Water","Need help","false","","",""')
  assert.ok(fields)
  if (!fields) throw new Error('expected fields')
  const report = normalizePortalReport(fields)
  assert.ok(report)
  if (!report) throw new Error('expected normalized portal report')
  assert.equal(report.type, 'Medical Emergency')
  assert.equal(report.locationAvailable, false)
  assert.equal(report.latitude, null)
})

test('parses phone GPS coordinates with the native companion capture timestamp', () => {
  const capturedAtMs = 1792627200000
  const fields = parseCsvRecord(
    '"Instant SOS","","1","","","","","","true","12.34567","76.54321","8","' + capturedAtMs + '"',
  )
  assert.ok(fields)
  if (!fields) throw new Error('expected timestamped phone GPS CSV')
  assert.equal(fields.length, 13)
  const report = normalizePortalReport(fields)
  assert.ok(report)
  if (!report) throw new Error('expected normalized phone GPS report')
  assert.equal(report.locationAvailable, true)
  assert.equal(report.latitude, 12.34567)
  assert.equal(report.longitude, 76.54321)
  assert.equal(report.accuracyM, 8)
  assert.equal(report.locationCapturedAtMs, capturedAtMs)
})

test('rejects an invalid location capture timestamp', () => {
  const fields = parseCsvRecord('"Instant SOS","","1","","","","","","true","12.34567","76.54321","8","not-a-time"')
  assert.ok(fields)
  if (!fields) throw new Error('expected CSV fields')
  assert.equal(normalizePortalReport(fields), null)
})

test('maps portal classifications and severity to the dashboard incident taxonomy', () => {
  assert.deepEqual(classifyPortalReport('Instant SOS', ''), { category: 'RESCUE', priority: 'CRITICAL' })
  assert.deepEqual(classifyPortalReport('Medical Emergency', 'Serious'), { category: 'MEDICAL', priority: 'HIGH' })
  assert.deepEqual(classifyPortalReport('Safe & Waiting', ''), { category: 'RESCUE', priority: 'LOW' })
})

test('interprets people values with the portal 4+ option as a lower bound', () => {
  assert.equal(peopleAffectedFromPortal('4+'), 4)
  assert.equal(peopleAffectedFromPortal('2'), 2)
  assert.equal(peopleAffectedFromPortal(''), null)
  assert.equal(peopleAffectedFromPortal('many'), undefined)
})


test('accepts the compact MPU6500 telemetry JSON and converts fixed-point values', () => {
  const telemetry = parseResQnetTelemetry('{"kind":"telemetry","gps_seen":0,"fix":0,"lat_e6":null,"lon_e6":null,"imu":1,"moving":0,"ax_mg":12,"ay_mg":-5,"az_mg":1000,"gx_dps10":0,"gy_dps10":3,"gz_dps10":-2}')
  assert.ok(telemetry)
  if (!telemetry) throw new Error('expected normalized telemetry')
  assert.equal(telemetry.imuPresent, true)
  assert.equal(telemetry.gpsSeen, false)
  assert.equal(telemetry.gpsFix, false)
  assert.equal(telemetry.moving, false)
  assert.equal(telemetry.axMg, 12)
  assert.equal(telemetry.latitude, null)
})

test('rejects invalid sensor telemetry instead of accepting malformed payloads', () => {
  assert.equal(parseResQnetTelemetry('{"kind":"telemetry","gps_seen":1,"fix":1,"lat_e6":null,"lon_e6":null,"imu":0,"moving":null}'), null)
  assert.equal(parseResQnetTelemetry('{"kind":"unknown"}'), null)
})


test('parses a stored latest IMU sample without inventing unavailable values', () => {
  const sample = parseImuSample(JSON.stringify({
    moving: true,
    acceleration_mg: { x: -631, y: -78, z: -773 },
    gyro_dps10: { x: -23, y: 50, z: 12 },
  }))
  assert.ok(sample)
  if (!sample) throw new Error('expected stored IMU sample')
  assert.equal(sample.moving, true)
  assert.equal(sample.acceleration_mg.x, -631)
  assert.equal(sample.gyro_dps10.y, 50)
})

test('returns no IMU sample for absent, malformed, or invalid measurement data', () => {
  assert.equal(parseImuSample(null), null)
  assert.equal(parseImuSample('not json'), null)
  assert.equal(parseImuSample(JSON.stringify({
    moving: 0,
    acceleration_mg: { x: 1, y: 2, z: 3 },
    gyro_dps10: { x: 0, y: 0, z: 0 },
  })), null)
})

test('treats recent gateway-observed reports as recent node contact without inventing heartbeat data', () => {
  const now = new Date('2026-10-21T12:00:00.000Z')
  const runtime = deriveNodeRuntimeState({
    now,
    gatewayContactAt: new Date('2026-10-21T11:59:30.000Z'),
    lifecycleState: 'DEPLOYED',
  })
  assert.equal(runtime.runtime_state, 'online')
  assert.equal(runtime.online, true)
  assert.equal(runtime.last_contact_source, 'gateway_report')
  assert.equal(runtime.last_contact_at?.toISOString(), '2026-10-21T11:59:30.000Z')
})

test('marks gateway contact offline after the five-minute freshness window', () => {
  const now = new Date('2026-10-21T12:00:00.000Z')
  const runtime = deriveNodeRuntimeState({
    now,
    gatewayContactAt: new Date('2026-10-21T11:54:59.000Z'),
    lifecycleState: 'DEPLOYED',
  })
  assert.equal(runtime.runtime_state, 'offline')
  assert.equal(runtime.online, false)
})

test('preserves fault status when the most recent contact is a fresh heartbeat', () => {
  const now = new Date('2026-10-21T12:00:00.000Z')
  const runtime = deriveNodeRuntimeState({
    now,
    heartbeatReceivedAt: new Date('2026-10-21T11:59:00.000Z'),
    gatewayContactAt: new Date('2026-10-21T11:58:00.000Z'),
    heartbeatHealthState: 'FAULT',
    lifecycleState: 'DEPLOYED',
  })
  assert.equal(runtime.runtime_state, 'fault')
  assert.equal(runtime.last_contact_source, 'heartbeat')
})

test('does not carry an old heartbeat fault over a newer gateway report', () => {
  const now = new Date('2026-10-21T12:00:00.000Z')
  const runtime = deriveNodeRuntimeState({
    now,
    heartbeatReceivedAt: new Date('2026-10-21T11:58:00.000Z'),
    gatewayContactAt: new Date('2026-10-21T11:59:00.000Z'),
    heartbeatHealthState: 'FAULT',
    lifecycleState: 'DEPLOYED',
  })
  assert.equal(runtime.runtime_state, 'online')
  assert.equal(runtime.last_contact_source, 'gateway_report')
})

test('keeps retired nodes offline even when contact is recent', () => {
  const now = new Date('2026-10-21T12:00:00.000Z')
  const runtime = deriveNodeRuntimeState({
    now,
    gatewayContactAt: new Date('2026-10-21T11:59:30.000Z'),
    lifecycleState: 'RETIRED',
  })
  assert.equal(runtime.runtime_state, 'offline')
  assert.equal(runtime.online, false)
})
