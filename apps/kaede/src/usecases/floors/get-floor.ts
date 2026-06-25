import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { FloorIdParams, FloorResponse } from '../../schemas/floors.js'
import { findFloorDetailById } from '../../services/floors/index.js'
import { accessibleOrganizationIds } from '../authorization.js'
import { toFloorResponse } from './floor-response.js'

export type GetFloorResult =
  | {
      ok: true
      value: FloorResponse
    }
  | {
      ok: false
      error: {
        type: 'FLOOR_NOT_FOUND'
        floorId: string
      }
    }

export const getFloor = async (
  actor: RequestActor,
  params: FloorIdParams
): Promise<GetFloorResult> => {
  const floor = await findFloorDetailById(params.floorId, {
    organizationIds: accessibleOrganizationIds(actor),
  })

  if (!floor) {
    return {
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId: params.floorId,
      },
    }
  }

  return {
    ok: true,
    value: toFloorResponse(floor),
  }
}
