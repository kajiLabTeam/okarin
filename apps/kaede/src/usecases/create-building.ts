import type { BuildingResponse, CreateBuildingRequest } from '../schemas/buildings.js'
import { insertBuilding } from '../services/buildings/index.js'

export const createBuilding = async (payload: CreateBuildingRequest): Promise<BuildingResponse> => {
  const building = await insertBuilding({
    name: payload.name,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
  })

  return {
    building_id: building.id,
    name: building.name,
    latitude: building.latitude,
    longitude: building.longitude,
    created_at: building.created_at.toISOString(),
    updated_at: building.updated_at.toISOString(),
  }
}
