import { z } from 'zod'
import { createHash } from 'node:crypto'
import { beaconLayout } from '../beacons/index.js'
import { findMapRevision, listRevisionBeacons } from '../floor-maps/revisions.js'
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
  floor_map_revision_id?: string
  scale?: number | null
  map_width_px?: number | null
  map_height_px?: number | null
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
  metadataInput: RecordingMetadataSnapshot,
  revision?: { id: string; organization_id: string }
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
  const beacons = revision
    ? await listRevisionBeacons(floorId, revision.organization_id, revision.id)
    : []
  return beacons.length > 0 ? beaconLayout(beacons) : undefined
}

/** 地図はフロアから、ビーコン配置は可能なら計測時のmetadataから解決する。 */
export const resolveFloorResources = async (
  recording: {
    floor_id: string
    floor_map_revision_id?: string
    organization_id: string
  },
  metadata: RecordingMetadataSnapshot = { status: 'absent' }
): Promise<PipelineResourceAsset[]> => {
  const revision = await findMapRevision(
    recording.floor_id,
    recording.organization_id,
    recording.floor_map_revision_id
  )
  const floor = revision ? { ...revision, floor_id: revision.floor_id } : undefined
  if (!floor) return []

  const [mapBytes, layout] = await Promise.all([
    getFloorMapObjectBytes(floor.image_object_path),
    resolveBeaconLayout(floor.floor_id, metadata, floor),
  ])
  const resources: PipelineResourceAsset[] = []

  if (mapBytes && mapBytes.byteLength > 0) {
    resources.push({
      data_asset_id: `resource:${floor.id}:floor-map`,
      data_type: 'resource.floor_map',
      schema_version: '1',
      format: floor.image_object_path.endsWith('.svg') ? 'svg' : 'png',
      floor_map_revision_id: floor.id,
      scale: floor.scale,
      map_width_px: floor.map_width_px,
      map_height_px: floor.map_height_px,
      validation_status: 'valid',
      object_key: floor.image_object_path,
      checksum_sha256: createHash('sha256').update(mapBytes).digest('hex'),
    })
  }

  if (!mapBytes || mapBytes.byteLength === 0)
    resources.push({
      data_asset_id: `resource:${floor.id}:floor-map`,
      data_type: 'resource.floor_map',
      schema_version: '1',
      format: floor.image_object_path.endsWith('.svg') ? 'svg' : 'png',
      validation_status: 'invalid',
      floor_map_revision_id: floor.id,
      object_key: floor.image_object_path,
    })

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
