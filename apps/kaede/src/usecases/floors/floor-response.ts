import type { FloorResponse } from '../../schemas/floors.js'

interface FloorResponseRow {
  floor_id: string
  building_id: string
  organization_id: string | null
  building_name: string
  level: number
  name: string
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

export const toFloorResponse = (floor: FloorResponseRow): FloorResponse => ({
  floor_id: floor.floor_id,
  building_id: floor.building_id,
  organization_id: requireOrganizationId(floor.floor_id, floor.organization_id),
  building_name: floor.building_name,
  level: floor.level,
  name: floor.name,
  scale: floor.scale,
  created_at: floor.created_at.toISOString(),
  updated_at: floor.updated_at.toISOString(),
})
