import { randomUUID } from 'node:crypto'
import type { CreateFloorRequest, FloorResponse } from '../schemas/floors.js'
import { findBuildingById } from '../services/buildings/index.js'
import { insertFloor } from '../services/floors/index.js'

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

export const createFloor = async (payload: CreateFloorRequest): Promise<CreateFloorResult> => {
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

  const mapImageExtension = payload.map_image_extension ?? 'png'
  const floorId = randomUUID()
  const floor = await insertFloor({
    id: floorId,
    building_id: building.id,
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
      building_name: building.name,
      level: floor.level,
      name: floor.name,
      scale: floor.scale,
      created_at: floor.created_at.toISOString(),
      updated_at: floor.updated_at.toISOString(),
    },
  }
}
