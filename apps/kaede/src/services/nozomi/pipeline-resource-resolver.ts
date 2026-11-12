import { z } from 'zod'
import { createHash } from 'node:crypto'
import { beaconLayout, listBeacons } from '../beacons/index.js'
import { findFloorDetailById } from '../floors/index.js'
import { getFloorMapObjectBytes, putBeaconLayoutObject } from '../storage/index.js'
import type { RecordingMetadataSnapshot } from './recording-metadata-snapshot.js'

export interface PipelineResourceAsset {
  data_asset_id: string
  data_type: string
  schema_version: string
  format: string
  validation_status: string
  object_key?: string
  checksum_sha256?: string | null
}

const metadataSchema = z.object({
  floor_id: z.string().optional(),
  ble: z.object({ configuration: z.unknown().optional() }).optional(),
})
const beaconSnapshotSchema = z.object({
  beacons: z
    .array(
      z.object({
        beacon_id: z.string().min(1),
        floor_id: z.string().optional(),
        pixel_x: z.number().nonnegative(),
        pixel_y: z.number().nonnegative(),
        enabled: z.boolean().default(true),
      })
    )
    .max(1000),
})

/** 計測時の配置を優先し、配置のない旧metadataだけ現在のDBへフォールバックする。 */
const resolveBeaconLayout = async (
  floorId: string,
  metadataInput: RecordingMetadataSnapshot
): Promise<string | undefined> => {
  if (metadataInput.status === 'unavailable') return undefined
  if (metadataInput.status === 'ready') {
    let document: unknown
    try {
      document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadataInput.bytes))
    } catch {
      return undefined
    }
    const metadata = metadataSchema.safeParse(document)
    if (
      !metadata.success ||
      (metadata.data.floor_id !== undefined && metadata.data.floor_id !== floorId)
    )
      return undefined
    const configuration = metadata.data.ble?.configuration
    if (configuration !== undefined) {
      const snapshot = beaconSnapshotSchema.safeParse(configuration)
      if (!snapshot.success) return undefined
      const beacons = snapshot.data.beacons
      if (
        beacons.some((beacon) => beacon.floor_id !== undefined && beacon.floor_id !== floorId) ||
        new Set(beacons.map((beacon) => beacon.beacon_id)).size !== beacons.length
      )
        return undefined
      const rows = beacons
        .filter((beacon) => beacon.enabled)
        .sort((a, b) => a.beacon_id.localeCompare(b.beacon_id))
        .map(({ beacon_id, pixel_x, pixel_y }) => ({ beacon_id, pixel_x, pixel_y }))
      // 空のスナップショットも当時の設定として扱い、DBの配置を混ぜない。
      return rows.length > 0 ? JSON.stringify({ beacons: rows }) : undefined
    }
  }
  const beacons = await listBeacons(floorId)
  return beacons.length > 0 ? beaconLayout(beacons) : undefined
}

/** 地図はフロアから、ビーコン配置は可能なら計測時のmetadataから解決する。 */
export const resolveFloorResources = async (
  recording: {
    floor_id: string
    organization_id: string
  },
  metadata: RecordingMetadataSnapshot = { status: 'absent' }
): Promise<PipelineResourceAsset[]> => {
  const floor = await findFloorDetailById(recording.floor_id, {
    organizationIds: [recording.organization_id],
  })
  if (!floor) return []

  const [mapBytes, layout] = await Promise.all([
    floor.image_object_path.toLowerCase().endsWith('.png')
      ? getFloorMapObjectBytes(floor.image_object_path)
      : Promise.resolve(undefined),
    resolveBeaconLayout(floor.floor_id, metadata),
  ])
  const resources: PipelineResourceAsset[] = []

  if (mapBytes && mapBytes.byteLength > 0) {
    resources.push({
      data_asset_id: `resource:${floor.floor_id}:floor-map`,
      data_type: 'resource.floor_map',
      schema_version: '1',
      format: 'png',
      validation_status: 'valid',
      object_key: floor.image_object_path,
      checksum_sha256: createHash('sha256').update(mapBytes).digest('hex'),
    })
  }

  if (layout !== undefined) {
    const layoutBytes = new TextEncoder().encode(layout)
    const configurationDigest = createHash('sha256').update(layoutBytes).digest('hex')
    const objectKey = `organizations/${recording.organization_id}/floors/${floor.floor_id}/beacon-layout/${configurationDigest}.json`
    await putBeaconLayoutObject(objectKey, layoutBytes)
    resources.push({
      data_asset_id: `resource:${floor.floor_id}:beacon-layout:${configurationDigest}`,
      data_type: 'resource.beacon_layout',
      schema_version: '1',
      format: 'json',
      validation_status: 'valid',
      object_key: objectKey,
      checksum_sha256: configurationDigest,
    })
  }

  return resources
}
