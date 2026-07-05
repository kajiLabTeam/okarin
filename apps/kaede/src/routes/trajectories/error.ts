import type { GetTrajectoryResult } from '../../usecases/trajectories/get-trajectory.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type GetTrajectoryError = Extract<GetTrajectoryResult, { ok: false }>['error']

export const toGetTrajectoryErrorResponse = (error: GetTrajectoryError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'TRAJECTORY_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory not found',
          details: {
            trajectory_id: error.trajectoryId,
          },
        },
        status: 404 as const,
      }
  }
}
