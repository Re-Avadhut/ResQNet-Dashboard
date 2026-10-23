export type ImuSample = {
  moving: boolean | null
  acceleration_mg: {
    x: number | null
    y: number | null
    z: number | null
  }
  gyro_dps10: {
    x: number | null
    y: number | null
    z: number | null
  }
}

/** Parse a stored latest-sample payload. Missing/invalid values remain unavailable. */
export function parseImuSample(raw: string | null | undefined): ImuSample | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const root = parsed as Record<string, unknown>
  const acceleration = root.acceleration_mg
  const gyro = root.gyro_dps10
  if (!acceleration || typeof acceleration !== 'object' || Array.isArray(acceleration)) return null
  if (!gyro || typeof gyro !== 'object' || Array.isArray(gyro)) return null

  const readNullableNumber = (value: unknown): number | null | undefined => {
    if (value === null) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return undefined
  }

  const acc = acceleration as Record<string, unknown>
  const gyr = gyro as Record<string, unknown>
  const ax = readNullableNumber(acc.x)
  const ay = readNullableNumber(acc.y)
  const az = readNullableNumber(acc.z)
  const gx = readNullableNumber(gyr.x)
  const gy = readNullableNumber(gyr.y)
  const gz = readNullableNumber(gyr.z)
  if ([ax, ay, az, gx, gy, gz].some((value) => value === undefined)) return null

  const moving =
    root.moving === true || root.moving === false
      ? root.moving
      : root.moving === null
        ? null
        : undefined
  if (moving === undefined) return null

  return {
    moving,
    acceleration_mg: { x: ax ?? null, y: ay ?? null, z: az ?? null },
    gyro_dps10: { x: gx ?? null, y: gy ?? null, z: gz ?? null },
  }
}
