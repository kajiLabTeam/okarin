import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { FloorIdParams, FloorResponse } from '../../schemas/floors.js'
import { findMapRevision } from '../../services/floor-maps/revisions.js'
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
  params: FloorIdParams & { revisionId?: string }
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

  if (params.revisionId) {
    const revision = await findMapRevision(
      floor.floor_id,
      floor.organization_id ?? '',
      params.revisionId
    )
    if (!revision) return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId: params.floorId } }
    return {
      ok: true,
      value: await toFloorResponse({
        ...floor,
        ...revision,
        floor_id: floor.floor_id,
        floor_map_revision_id: revision.id,
      }),
    }
  }
  return { ok: true, value: await toFloorResponse(floor) }
}
