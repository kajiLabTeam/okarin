import type { BuildingResponse } from '../../schemas/buildings.js'

interface BuildingResponseRow {
  id: string
  organization_id: string
  name: string
  latitude: number | null
  longitude: number | null
  created_at: Date
  updated_at: Date
}

export const toBuildingResponse = (building: BuildingResponseRow): BuildingResponse => ({
  building_id: building.id,
  organization_id: building.organization_id,
  name: building.name,
  latitude: building.latitude,
  longitude: building.longitude,
  created_at: building.created_at.toISOString(),
  updated_at: building.updated_at.toISOString(),
})
