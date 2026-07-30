import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { BuildingIdParams, BuildingResponse } from '../../schemas/buildings.js'
import { findBuildingDetailById } from '../../services/buildings/index.js'
import { accessibleOrganizationIds } from '../authorization.js'
import { toBuildingResponse } from './building-response.js'

export type GetBuildingResult =
  | {
      ok: true
      value: BuildingResponse
    }
  | {
      ok: false
      error: {
        type: 'BUILDING_NOT_FOUND'
        buildingId: string
      }
    }

export const getBuilding = async (
  actor: RequestActor,
  params: BuildingIdParams
): Promise<GetBuildingResult> => {
  const building = await findBuildingDetailById(params.buildingId, {
    organizationIds: accessibleOrganizationIds(actor),
  })

  if (!building) {
    return {
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId: params.buildingId,
      },
    }
  }

  return {
    ok: true,
    value: toBuildingResponse(building),
  }
}
