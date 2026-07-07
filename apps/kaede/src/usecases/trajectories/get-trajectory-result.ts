import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { TrajectoryResultResponse } from '../../schemas/trajectories.js'
import { issueTrajectoryResultDownloadUrl } from '../../services/storage/index.js'
import { findTrajectoryById } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

export type GetTrajectoryResultDownloadError =
  | AuthorizationError
  | {
      type: 'TRAJECTORY_NOT_FOUND'
      trajectoryId: string
    }
  | {
      type: 'TRAJECTORY_RESULT_NOT_READY'
      trajectoryId: string
      status: string
    }

export type GetTrajectoryResultDownloadResult =
  | {
      ok: true
      value: TrajectoryResultResponse
    }
  | {
      ok: false
      error: GetTrajectoryResultDownloadError
    }

export const getTrajectoryResult = async (
  actor: RequestActor,
  params: { trajectoryId: string }
): Promise<GetTrajectoryResultDownloadResult> => {
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

  if (trajectory.status !== 'completed') {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_RESULT_NOT_READY',
        trajectoryId: trajectory.id,
        status: trajectory.status,
      },
    }
  }

  const resultDownload = await issueTrajectoryResultDownloadUrl(trajectory.id)

  return {
    ok: true,
    value: {
      trajectory_id: trajectory.id,
      download_url: resultDownload.downloadUrl,
      expires_at: resultDownload.expiresAt,
    },
  }
}
