import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { CreateFloorRequest, CreateFloorResponse } from '../../schemas/floors.js'
import { findBuildingById } from '../../services/buildings/index.js'
import { insertFloor } from '../../services/floors/index.js'
import {
  buildFloorMapObjectKey,
  issueFloorMapDownloadUrl,
  issueFloorMapUploadUrl,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireDashboardWriteAccess } from '../authorization.js'

export type CreateFloorResult =
  | {
      ok: true
      value: CreateFloorResponse
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

export const createFloor = async (
  actor: RequestActor,
  organizationId: string,
  buildingId: string,
  payload: CreateFloorRequest
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

  const mapImageExtension = payload.map_image_extension ?? 'png'
  const floorId = randomUUID()
  const imageObjectPath = buildFloorMapObjectKey(building.id, floorId, mapImageExtension)
  const [mapUpload, mapDownload] = await Promise.all([
    issueFloorMapUploadUrl(imageObjectPath, mapImageExtension),
    issueFloorMapDownloadUrl(imageObjectPath),
  ])
  const floor = await insertFloor({
    id: floorId,
    building_id: building.id,
    organization_id: building.organization_id,
    level: payload.level,
    name: payload.name,
    image_object_path: imageObjectPath,
    scale: payload.scale ?? null,
  })

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
      map_image: {
        download_url: mapDownload.url,
        download_expires_at: mapDownload.expiresAt,
      },
      map_upload: {
        url: mapUpload.url,
        expires_at: mapUpload.expiresAt,
      },
      created_at: floor.created_at.toISOString(),
      updated_at: floor.updated_at.toISOString(),
    },
  }
}
