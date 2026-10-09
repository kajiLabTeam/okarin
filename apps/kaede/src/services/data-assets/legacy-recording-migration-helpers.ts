export const supportedLegacyDataTypes = ['acce', 'gyro'] as const

export const legacySensorTargets = (uploadTargets: readonly string[]) =>
  supportedLegacyDataTypes.filter((dataType) => uploadTargets.includes(dataType))

export const unsupportedLegacySensorTargets = (uploadTargets: readonly string[]) =>
  uploadTargets.filter(
    (target) =>
      target !== 'metadata' &&
      !supportedLegacyDataTypes.includes(target as (typeof supportedLegacyDataTypes)[number])
  )
