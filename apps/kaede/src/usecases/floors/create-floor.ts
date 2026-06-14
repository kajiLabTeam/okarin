import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { CreateFloorRequest, FloorResponse } from '../../schemas/floors.js'
import { findBuildingById } from '../../services/buildings/index.js'
import { insertFloor } from '../../services/floors/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireDashboardWriteAccess } from '../authorization.js'

export type CreateFloorResult =
  | {
      ok: true
      value: FloorResponse
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
  payload: CreateFloorRequest
): Promise<CreateFloorResult> => {
  const buildingId: string = payload.building_id
  const building = await findBuildingById(buildingId)

  if (!building) {
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
  const floor = await insertFloor({
    id: floorId,
    building_id: building.id,
    organization_id: building.organization_id,
    level: payload.level,
    name: payload.name,
    image_object_path: `maps/${building.id}/${floorId}.${mapImageExtension}`,
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
      created_at: floor.created_at.toISOString(),
      updated_at: floor.updated_at.toISOString(),
    },
  }
}
