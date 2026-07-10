import type { RequestActor } from '../../middleware/request-actor-context.js'
import { findTrajectoryById, softDeleteTrajectory } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireUserDashboardWriteAccess } from '../authorization.js'

export type DeleteTrajectoryError =
  | AuthorizationError
  | {
      type: 'TRAJECTORY_NOT_FOUND'
      trajectoryId: string
    }

export type DeleteTrajectoryResult =
  | {
      ok: true
    }
  | {
      ok: false
      error: DeleteTrajectoryError
    }

export const deleteTrajectory = async (
  actor: RequestActor,
  params: { trajectoryId: string }
): Promise<DeleteTrajectoryResult> => {
  const trajectory = await findTrajectoryById(params.trajectoryId)

  if (!trajectory) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId: params.trajectoryId,
      },
    }
  }

  const authorization = requireUserDashboardWriteAccess(actor, trajectory.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  const deleted = await softDeleteTrajectory(trajectory.id)

  if (!deleted) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId: trajectory.id,
      },
    }
  }

  return {
    ok: true,
  }
}
