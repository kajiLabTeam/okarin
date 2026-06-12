import { listFloors as listFloorRows } from '../services/floors/index.js'

const requireOrganizationId = (floorId: string, organizationId: string | null): string => {
  if (!organizationId) {
    throw new Error(`floor ${floorId} does not have organization_id`)
  }

  return organizationId
}

export const listFloors = async () => {
  const floors = await listFloorRows()

  return {
    floors: floors.map((floor) => ({
      floor_id: floor.floor_id,
      building_id: floor.building_id,
      organization_id: requireOrganizationId(floor.floor_id, floor.organization_id),
      building_name: floor.building_name,
      level: floor.level,
      name: floor.name,
      scale: floor.scale,
      created_at: floor.created_at.toISOString(),
      updated_at: floor.updated_at.toISOString(),
    })),
  }
}
