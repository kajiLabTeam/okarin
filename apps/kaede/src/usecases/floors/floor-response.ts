import type { FloorResponse } from '../../schemas/floors.js'
import {
  getFloorMapContentType,
  getFloorMapExtensionFromObjectKey,
  issueFloorMapDownloadUrl,
} from '../../services/storage/index.js'

interface FloorResponseRow {
  current_map_revision_id?: string | null
  initial_map_revision_id?: string | null
  beacons_need_review?: boolean | null
  floor_map_revision_id?: string
  revision?: number
  floor_id: string
  building_id: string
  organization_id: string | null
  building_name: string
  level: number
  name: string
  image_object_path: string
  map_width_px: number | null
  map_height_px: number | null
  scale: number | null
  created_at: Date
  updated_at: Date
}

const requireOrganizationId = (floorId: string, organizationId: string | null): string => {
  if (!organizationId) {
    throw new Error(`floor ${floorId} does not have organization_id`)
  }

  return organizationId
}

export const toFloorResponse = async (floor: FloorResponseRow): Promise<FloorResponse> => {
  const extension = getFloorMapExtensionFromObjectKey(floor.image_object_path)

  if (!extension) {
    throw new Error(`floor ${floor.floor_id} has invalid image_object_path`)
  }

  const downloadUrl = await issueFloorMapDownloadUrl(floor.image_object_path)

  return {
    floor_id: floor.floor_id,
    current_map_revision_id: floor.current_map_revision_id,
    initial_map_revision_id: floor.initial_map_revision_id,
    floor_map_revision_id:
      floor.floor_map_revision_id ?? floor.current_map_revision_id ?? undefined,
    revision: floor.revision,
    beacons_need_review: floor.beacons_need_review ?? false,
    building_id: floor.building_id,
    organization_id: requireOrganizationId(floor.floor_id, floor.organization_id),
    building_name: floor.building_name,
    level: floor.level,
    name: floor.name,
    scale: floor.scale,
    map_width_px: floor.map_width_px,
    map_height_px: floor.map_height_px,
    map_image: {
      download_url: downloadUrl.url,
      download_expires_at: downloadUrl.expiresAt,
      content_type: getFloorMapContentType(extension),
      extension,
    },
    created_at: floor.created_at.toISOString(),
    updated_at: floor.updated_at.toISOString(),
  }
}
