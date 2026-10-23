/** Helpers for decoding legacy 12-field and timestamped 13-field ResQnet portal CSV records. */
export type ResQnetPortalReport = {
  type: string
  name: string
  peopleText: string
  emergency: string
  injuryLevel: string
  situation: string
  supplies: string
  details: string
  locationAvailable: boolean
  latitude: number | null
  longitude: number | null
  accuracyM: number | null
  locationCapturedAtMs: number | null
}

/** Parse a single CSV record, including quoted commas and escaped double quotes. */
export function parseCsvRecord(input: string): string[] | null {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  let closedQuote = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }

    if (char === ',') {
      fields.push(field)
      field = ''
      closedQuote = false
      continue
    }

    if (char === '"' && field.length === 0 && !closedQuote) {
      inQuotes = true
      continue
    }

    if (closedQuote && char.trim() !== '') return null
    field += char
  }

  if (inQuotes) return null
  fields.push(field)
  return fields
}

function optionalCoordinate(value: string, minimum: number, maximum: number): number | null | undefined {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined
  return parsed
}

/** Validates legacy 12-field and timestamped 13-field portal CSV records. */
export function normalizePortalReport(fields: string[]): ResQnetPortalReport | null {
  if (fields.length !== 12 && fields.length !== 13) return null

  const hasLatitude = fields[9].trim() !== ''
  const hasLongitude = fields[10].trim() !== ''
  if (hasLatitude !== hasLongitude) return null

  const latitude = optionalCoordinate(fields[9], -90, 90)
  const longitude = optionalCoordinate(fields[10], -180, 180)
  const accuracyM = optionalCoordinate(fields[11], 0, 1_000_000)
  if (latitude === undefined || longitude === undefined || accuracyM === undefined) return null

  const locationAvailable = fields[8].trim().toLowerCase() === 'true'
  const hasCoordinates = latitude !== null && longitude !== null
  let locationCapturedAtMs: number | null = null
  if (fields.length === 13 && fields[12].trim() !== '') {
    const capturedAt = Number(fields[12])
    if (!Number.isSafeInteger(capturedAt) || capturedAt < 1 || capturedAt > Number.MAX_SAFE_INTEGER) return null
    locationCapturedAtMs = capturedAt
  }
  if (locationCapturedAtMs !== null && (!locationAvailable || !hasCoordinates)) return null

  return {
    type: fields[0].trim().slice(0, 80),
    name: fields[1].trim().slice(0, 80),
    peopleText: fields[2].trim().slice(0, 20),
    emergency: fields[3].trim().slice(0, 180),
    injuryLevel: fields[4].trim().slice(0, 40),
    situation: fields[5].trim().slice(0, 180),
    supplies: fields[6].trim().slice(0, 180),
    details: fields[7].trim().slice(0, 240),
    locationAvailable: locationAvailable && hasCoordinates,
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    accuracyM: hasCoordinates ? accuracyM : null,
    locationCapturedAtMs: locationAvailable && hasCoordinates ? locationCapturedAtMs : null,
  }
}

export function peopleAffectedFromPortal(value: string): number | null | undefined {
  if (value.trim() === '') return null
  const match = value.trim().match(/^(\d+)(\+)?$/)
  if (!match) return undefined
  const count = Number(match[1])
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) return undefined
  return count
}

export function classifyPortalReport(reportType: string, injuryLevel: string): {
  category: 'RESCUE' | 'MEDICAL' | 'OTHER'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
} {
  const type = reportType.toLowerCase()
  if (type.includes('medical')) {
    const severity = injuryLevel.toLowerCase()
    return {
      category: 'MEDICAL',
      priority: severity === 'critical' ? 'CRITICAL' : severity === 'serious' ? 'HIGH' : 'MEDIUM',
    }
  }
  if (type.includes('safe')) return { category: 'RESCUE', priority: 'LOW' }
  if (type.includes('sos')) return { category: 'RESCUE', priority: 'CRITICAL' }
  return { category: 'OTHER', priority: 'MEDIUM' }
}

export type ResQnetTelemetry = {
  gpsSeen: boolean
  gpsFix: boolean
  latitude: number | null
  longitude: number | null
  imuPresent: boolean
  moving: boolean | null
  axMg: number | null
  ayMg: number | null
  azMg: number | null
  gxDps10: number | null
  gyDps10: number | null
  gzDps10: number | null
}

/** Decode the compact JSON telemetry emitted by the optional node sensor manager. */
export function parseResQnetTelemetry(input: string): ResQnetTelemetry | null {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  if (obj.kind !== 'telemetry') return null

  const bit = (candidate: unknown): boolean | null => {
    if (candidate === 0 || candidate === false) return false
    if (candidate === 1 || candidate === true) return true
    return null
  }
  const gpsSeen = bit(obj.gps_seen)
  const gpsFix = bit(obj.fix)
  const imuPresent = bit(obj.imu)
  const movingBit = obj.moving === null ? null : bit(obj.moving)
  if (gpsSeen === null || gpsFix === null || imuPresent === null || (obj.moving !== null && movingBit === null)) return null

  const integerOrNull = (candidate: unknown): number | null | undefined => {
    if (candidate === null) return null
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate)) return undefined
    return candidate
  }
  const latE6 = integerOrNull(obj.lat_e6)
  const lonE6 = integerOrNull(obj.lon_e6)
  if (latE6 === undefined || lonE6 === undefined || (latE6 === null) !== (lonE6 === null)) return null
  if (gpsFix) {
    if (latE6 === null || lonE6 === null || latE6 < -90_000_000 || latE6 > 90_000_000 || lonE6 < -180_000_000 || lonE6 > 180_000_000) return null
  } else if (latE6 !== null || lonE6 !== null) {
    return null
  }

  const optionalInteger = (key: string): number | null | undefined => {
    if (!(key in obj)) return null
    return integerOrNull(obj[key])
  }
  const axMg = optionalInteger('ax_mg')
  const ayMg = optionalInteger('ay_mg')
  const azMg = optionalInteger('az_mg')
  const gxDps10 = optionalInteger('gx_dps10')
  const gyDps10 = optionalInteger('gy_dps10')
  const gzDps10 = optionalInteger('gz_dps10')
  if ([axMg, ayMg, azMg, gxDps10, gyDps10, gzDps10].some((n) => n === undefined)) return null

  return {
    gpsSeen,
    gpsFix,
    latitude: gpsFix && latE6 !== null ? latE6 / 1_000_000 : null,
    longitude: gpsFix && lonE6 !== null ? lonE6 / 1_000_000 : null,
    imuPresent,
    moving: movingBit,
    axMg: axMg ?? null,
    ayMg: ayMg ?? null,
    azMg: azMg ?? null,
    gxDps10: gxDps10 ?? null,
    gyDps10: gyDps10 ?? null,
    gzDps10: gzDps10 ?? null,
  }
}
