import * as Sentry from '@sentry/node'
import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { CreateFloorRequest, FloorResponse } from '../../schemas/floors.js'
import { findBuildingById } from '../../services/buildings/index.js'
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
export const floorMapMaxSidePx = 20_000
export const floorMapMaxPixels = 100_000_000

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

const pngMagicNumber = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const hasPngMagicNumber = (bytes: Uint8Array) => {
  return pngMagicNumber.every((value, index) => bytes[index] === value)
}

interface FloorMapDimensions {
  width: number
  height: number
}

const areValidDimensions = ({ width, height }: FloorMapDimensions) =>
  Number.isInteger(width) &&
  Number.isInteger(height) &&
  width > 0 &&
  height > 0 &&
  width <= floorMapMaxSidePx &&
  height <= floorMapMaxSidePx &&
  width * height <= floorMapMaxPixels

const extractPngDimensions = (bytes: Uint8Array): FloorMapDimensions | undefined => {
  if (!hasPngMagicNumber(bytes) || bytes.byteLength < 24) return undefined

  const chunkType = new TextDecoder('ascii').decode(bytes.slice(12, 16))
  if (chunkType !== 'IHDR') return undefined

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dimensions = { width: view.getUint32(16), height: view.getUint32(20) }
  return areValidDimensions(dimensions) ? dimensions : undefined
}

const extractSvgDimensions = (bytes: Uint8Array): FloorMapDimensions | undefined => {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

  const svgTag = /<\s*svg\b[^>]*>/i.exec(text)?.[0]
  if (!svgTag) return undefined

  if (/<\s*script(?:\s|>)/i.test(text) || /<\s*foreignObject(?:\s|>)/i.test(text)) {
    return undefined
  }

  if (/\son[a-z]+\s*=/i.test(text)) return undefined

  const viewBox = /\bviewBox\s*=\s*["']\s*0\s+0\s+(\d+)\s+(\d+)\s*["']/i.exec(svgTag)
  if (!viewBox) return undefined

  const dimensions = { width: Number(viewBox[1]), height: Number(viewBox[2]) }
  return areValidDimensions(dimensions) ? dimensions : undefined
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
    const dimensions = extractPngDimensions(upload.bytes)
    return dimensions
      ? { ok: true, extension: 'png', dimensions }
      : { ok: false, error: { type: 'FLOOR_MAP_IMAGE_INVALID' } }
  }

  const dimensions = extractSvgDimensions(upload.bytes)
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
