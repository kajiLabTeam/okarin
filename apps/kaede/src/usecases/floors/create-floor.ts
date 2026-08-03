import * as Sentry from '@sentry/node'
import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { CreateFloorRequest, FloorResponse } from '../../schemas/floors.js'
import { findBuildingById } from '../../services/buildings/index.js'
import {
  extractFloorMapDimensions,
  floorMapMaxPixels,
  floorMapMaxSidePx,
} from '../../services/floor-maps/dimensions.js'
import type { FloorMapDimensions } from '../../services/floor-maps/dimensions.js'
import { insertFloor } from '../../services/floors/index.js'
import {
  buildFloorMapObjectKey,
  deleteFloorMapObject,
  getFloorMapContentType,
  issueFloorMapDownloadUrl,
  putFloorMapObject,
} from '../../services/storage/index.js'
import type { FloorMapContentType, FloorMapImageExtension } from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireDashboardWriteAccess } from '../authorization.js'

export const floorMapImageMaxBytes = 10 * 1024 * 1024
export { floorMapMaxPixels, floorMapMaxSidePx }

export interface FloorMapImageUpload {
  bytes: Uint8Array
  contentType: FloorMapContentType
}

export type CreateFloorResult =
  | {
      ok: true
      value: FloorResponse
    }
  | {
      ok: false
      error: {
        type: 'FLOOR_MAP_IMAGE_INVALID'
      }
    }
  | {
      ok: false
      error: {
        type: 'FLOOR_MAP_IMAGE_TOO_LARGE'
        maxBytes: number
      }
    }
  | {
      ok: false
      error: {
        type: 'BUILDING_NOT_FOUND'
        buildingId: string
      }
    }
  | {
      ok: false
      error: AuthorizationError
    }

const validateFloorMapImage = (
  upload: FloorMapImageUpload
):
  | {
      ok: true
      extension: FloorMapImageExtension
      dimensions: FloorMapDimensions
    }
  | {
      ok: false
      error: Extract<
        CreateFloorResult,
        { ok: false; error: { type: 'FLOOR_MAP_IMAGE_INVALID' | 'FLOOR_MAP_IMAGE_TOO_LARGE' } }
      >['error']
    } => {
  if (upload.bytes.byteLength > floorMapImageMaxBytes) {
    return {
      ok: false,
      error: {
        type: 'FLOOR_MAP_IMAGE_TOO_LARGE',
        maxBytes: floorMapImageMaxBytes,
      },
    }
  }

  if (upload.contentType === 'image/png') {
    const dimensions = extractFloorMapDimensions(upload.bytes, 'png')
    return dimensions
      ? { ok: true, extension: 'png', dimensions }
      : { ok: false, error: { type: 'FLOOR_MAP_IMAGE_INVALID' } }
  }

  const dimensions = extractFloorMapDimensions(upload.bytes, 'svg')
  return dimensions
    ? { ok: true, extension: 'svg', dimensions }
    : { ok: false, error: { type: 'FLOOR_MAP_IMAGE_INVALID' } }
}

export const createFloor = async (
  actor: RequestActor,
  organizationId: string,
  buildingId: string,
  payload: CreateFloorRequest,
  mapImage: FloorMapImageUpload
): Promise<CreateFloorResult> => {
  const building = await findBuildingById(buildingId)

  if (building?.organization_id !== organizationId) {
    return {
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    }
  }

  if (!building.organization_id) {
    throw new Error(`building ${building.id} does not have organization_id`)
  }

  const authorization = requireDashboardWriteAccess(actor, building.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  const mapValidation = validateFloorMapImage(mapImage)

  if (!mapValidation.ok) {
    return mapValidation.error.type === 'FLOOR_MAP_IMAGE_TOO_LARGE'
      ? {
          ok: false,
          error: mapValidation.error,
        }
      : {
          ok: false,
          error: mapValidation.error,
        }
  }

  const mapImageExtension = mapValidation.extension
  const floorId = randomUUID()
  const imageObjectPath = buildFloorMapObjectKey(
    building.organization_id,
    floorId,
    mapImageExtension
  )
  await putFloorMapObject(imageObjectPath, mapImageExtension, mapImage.bytes)
  let floor: Awaited<ReturnType<typeof insertFloor>>

  try {
    floor = await insertFloor({
      id: floorId,
      building_id: building.id,
      organization_id: building.organization_id,
      level: payload.level,
      name: payload.name,
      image_object_path: imageObjectPath,
      map_width_px: mapValidation.dimensions.width,
      map_height_px: mapValidation.dimensions.height,
      scale: payload.scale ?? null,
    })
  } catch (error) {
    try {
      await deleteFloorMapObject(imageObjectPath)
    } catch (cleanupError) {
      Sentry.captureException(cleanupError, {
        extra: {
          objectKey: imageObjectPath,
        },
      })
    }

    throw error
  }

  const mapDownload = await issueFloorMapDownloadUrl(imageObjectPath)

  return {
    ok: true,
    value: {
      floor_id: floor.id,
      building_id: building.id,
      organization_id: building.organization_id,
      building_name: building.name,
      level: floor.level,
      name: floor.name,
      scale: floor.scale,
      map_width_px: floor.map_width_px,
      map_height_px: floor.map_height_px,
      map_image: {
        download_url: mapDownload.url,
        download_expires_at: mapDownload.expiresAt,
        content_type: getFloorMapContentType(mapImageExtension),
        extension: mapImageExtension,
      },
      created_at: floor.created_at.toISOString(),
      updated_at: floor.updated_at.toISOString(),
    },
  }
}
