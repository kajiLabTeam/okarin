import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { TrajectoryStatusResponse } from '../../schemas/trajectories.js'
import type { TrajectoryWithExecution } from '../../services/trajectories/index.js'
import { findTrajectoryById } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

export type GetTrajectoryError =
  | AuthorizationError
  | {
      type: 'TRAJECTORY_NOT_FOUND'
      trajectoryId: string
    }

export type GetTrajectoryResult =
  | {
      ok: true
      value: TrajectoryStatusResponse
    }
  | {
      ok: false
      error: GetTrajectoryError
    }

const toTrajectoryStatusResponse = (
  trajectory: TrajectoryWithExecution
): TrajectoryStatusResponse => ({
  trajectory_id: trajectory.id,
  recording_id: trajectory.recording_id,
  organization_id: trajectory.organization_id,
  status: trajectory.status as TrajectoryStatusResponse['status'],
  error_code: trajectory.error_code,
  error_message: trajectory.error_message,
  failed_at: trajectory.failed_at?.toISOString() ?? null,
  execution: trajectory.execution ?? null,
})

export const getTrajectory = async (
  actor: RequestActor,
  params: { trajectoryId: string }
): Promise<GetTrajectoryResult> => {
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

  const authorization = requireOrganizationManager(actor, trajectory.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  return {
    ok: true,
    value: toTrajectoryStatusResponse(trajectory),
  }
}
