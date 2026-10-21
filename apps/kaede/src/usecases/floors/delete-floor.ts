import type { RequestActor } from '../../middleware/request-actor-context.js'
import { findFloorDetailById, softDeleteFloor } from '../../services/floors/index.js'
import { requireDashboardWriteAccess } from '../authorization.js'
import type { AuthorizationError } from '../authorization.js'

export type DeleteFloorResult =
  | { ok: true }
  | { ok: false; error: { type: 'FLOOR_NOT_FOUND'; floorId: string } }
  | { ok: false; error: AuthorizationError }

export const deleteFloor = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string
): Promise<DeleteFloorResult> => {
  const floor = await findFloorDetailById(floorId, { organizationIds: [organizationId] })

  if (!floor) {
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } }
  }

  const authorization = requireDashboardWriteAccess(actor, organizationId)
  if (!authorization.ok) return authorization

  const deleted = await softDeleteFloor(floorId)
  return deleted ? { ok: true } : { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } }
}
