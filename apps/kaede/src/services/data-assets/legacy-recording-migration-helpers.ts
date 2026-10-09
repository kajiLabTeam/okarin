export const supportedLegacyDataTypes = ['acce', 'gyro'] as const

export const legacyColumnAliases: Record<string, string[]> = {
  x: ['x(m/s^2)', 'x(rad/s)'],
  y: ['y(m/s^2)', 'y(rad/s)'],
  z: ['z(m/s^2)', 'z(rad/s)'],
}

export const legacySensorTargets = (uploadTargets: readonly string[]) =>
  supportedLegacyDataTypes.filter((dataType) => uploadTargets.includes(dataType))

export const unsupportedLegacySensorTargets = (uploadTargets: readonly string[]) =>
  uploadTargets.filter(
    (target) =>
      target !== 'metadata' &&
      !supportedLegacyDataTypes.includes(target as (typeof supportedLegacyDataTypes)[number])
  )
