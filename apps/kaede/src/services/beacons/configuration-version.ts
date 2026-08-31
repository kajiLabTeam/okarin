import { createHash } from 'node:crypto'
import { ibeaconConfigSchema } from '../../schemas/beacons.js'

export interface ConfigurationBeacon {
  id: string
  floor_id: string
  format_type: string
  format_config: unknown
  pixel_x: number
  pixel_y: number
  enabled: boolean
  deleted_at: Date | null
}

export const configurationVersion = (beacons: ConfigurationBeacon[]) => {
  const canonical = beacons
    .filter((beacon) => beacon.enabled && beacon.deleted_at === null)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((beacon) => {
      const config = ibeaconConfigSchema.parse(beacon.format_config)
      return {
        beacon_id: beacon.id,
        floor_id: beacon.floor_id,
        format_type: beacon.format_type,
        format_config: {
          uuid: config.uuid.toLowerCase(),
          major: config.major,
          minor: config.minor,
        },
        pixel_x: beacon.pixel_x,
        pixel_y: beacon.pixel_y,
        enabled: beacon.enabled,
      }
    })
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`
}
