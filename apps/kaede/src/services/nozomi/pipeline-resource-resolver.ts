import { createHash } from 'node:crypto'
import { beaconLayout, listBeacons } from '../beacons/index.js'
import { findFloorDetailById } from '../floors/index.js'
import { getFloorMapObjectBytes, putBeaconLayoutObject } from '../storage/index.js'

export interface PipelineResourceAsset {
  data_asset_id: string
  data_type: string
  schema_version: string
  format: string
  validation_status: string
  object_key?: string
  checksum_sha256?: string | null
}

/** Resolve resources owned by the recording's floor for a pipeline input. */
export const resolveFloorResources = async (recording: {
  floor_id: string
  organization_id: string
}): Promise<PipelineResourceAsset[]> => {
  const floor = await findFloorDetailById(recording.floor_id, {
    organizationIds: [recording.organization_id],
  })
  if (!floor) return []

  const [mapBytes, beacons] = await Promise.all([
    floor.image_object_path.toLowerCase().endsWith('.png')
      ? getFloorMapObjectBytes(floor.image_object_path)
      : Promise.resolve(undefined),
    listBeacons(floor.floor_id),
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

  if (beacons.length > 0) {
    const layoutBytes = new TextEncoder().encode(beaconLayout(beacons))
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
