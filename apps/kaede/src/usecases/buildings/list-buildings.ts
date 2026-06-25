import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { BuildingResponse } from '../../schemas/buildings.js'
import { listBuildings as listBuildingRows } from '../../services/buildings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { toBuildingResponse } from './building-response.js'

export type ListBuildingsResult =
  | {
      ok: true
      value: {
        buildings: BuildingResponse[]
      }
    }
  | {
      ok: false
      error: AuthorizationError
    }

export const listBuildings = async (actor: RequestActor): Promise<ListBuildingsResult> => {
  if (actor.type !== 'service_client' && actor.global_role !== 'admin') {
    return {
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    }
  }

  const buildings = await listBuildingRows()

  return {
    ok: true,
    value: {
      buildings: buildings.map(toBuildingResponse),
    },
  }
}
