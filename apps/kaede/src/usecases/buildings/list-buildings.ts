import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { BuildingResponse } from '../../schemas/buildings.js'
import { listBuildings as listBuildingRows } from '../../services/buildings/index.js'
import { accessibleOrganizationIds } from '../authorization.js'
import { toBuildingResponse } from './building-response.js'

export const listBuildings = async (
  actor: RequestActor
): Promise<{ buildings: BuildingResponse[] }> => {
  const buildings = await listBuildingRows({
    organizationIds: accessibleOrganizationIds(actor),
  })

  return {
    buildings: buildings.map(toBuildingResponse),
  }
}
