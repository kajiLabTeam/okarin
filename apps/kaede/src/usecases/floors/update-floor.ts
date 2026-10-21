import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { FloorResponse, UpdateFloorRequest } from '../../schemas/floors.js'
import { findFloorDetailById, updateFloor as updateFloorRow } from '../../services/floors/index.js'
import { requireDashboardWriteAccess } from '../authorization.js'
import type { AuthorizationError } from '../authorization.js'
import { toFloorResponse } from './floor-response.js'

export type UpdateFloorResult =
  | { ok: true; value: FloorResponse }
  | { ok: false; error: { type: 'FLOOR_NOT_FOUND'; floorId: string } }
  | { ok: false; error: { type: 'FLOOR_UPDATE_INVALID'; reason: 'empty' } }
  | { ok: false; error: AuthorizationError }

export const updateFloor = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string,
  payload: UpdateFloorRequest
): Promise<UpdateFloorResult> => {
  const floor = await findFloorDetailById(floorId, { organizationIds: [organizationId] })

  if (!floor) {
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } }
  }

  const authorization = requireDashboardWriteAccess(actor, organizationId)
  if (!authorization.ok) return authorization

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: { type: 'FLOOR_UPDATE_INVALID', reason: 'empty' } }
  }

  const updated = await updateFloorRow(floorId, payload)
  if (!updated) {
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } }
  }

  const updatedDetail = await findFloorDetailById(floorId, {
    organizationIds: [organizationId],
  })
  if (!updatedDetail) {
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } }
  }

  return { ok: true, value: await toFloorResponse(updatedDetail) }
}
