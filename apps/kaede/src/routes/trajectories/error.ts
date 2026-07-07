import type { GetTrajectoryMapDataResult } from '../../usecases/trajectories/get-trajectory-map-data.js'
import type { GetTrajectoryResultDownloadResult } from '../../usecases/trajectories/get-trajectory-result.js'
import type { GetTrajectoryResult } from '../../usecases/trajectories/get-trajectory.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type GetTrajectoryError = Extract<GetTrajectoryResult, { ok: false }>['error']
type GetTrajectoryResultDownloadError = Extract<
  GetTrajectoryResultDownloadResult,
  { ok: false }
>['error']
type GetTrajectoryMapDataError = Extract<GetTrajectoryMapDataResult, { ok: false }>['error']

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

export const toGetTrajectoryResultErrorResponse = (error: GetTrajectoryResultDownloadError) => {
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
    case 'TRAJECTORY_RESULT_NOT_READY':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory result is not ready',
          details: {
            trajectory_id: error.trajectoryId,
            status: error.status,
          },
        },
        status: 409 as const,
      }
  }
}

export const toGetTrajectoryMapDataErrorResponse = (error: GetTrajectoryMapDataError) => {
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
    case 'TRAJECTORY_MAP_DATA_NOT_READY':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory map data is not ready',
          details: {
            trajectory_id: error.trajectoryId,
            status: error.status,
          },
        },
        status: 409 as const,
      }
    case 'TRAJECTORY_MAP_DATA_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory map data not found',
          details: {
            trajectory_id: error.trajectoryId,
          },
        },
        status: 409 as const,
      }
    case 'TRAJECTORY_MAP_DATA_INVALID':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory map data is invalid',
          details: {
            trajectory_id: error.trajectoryId,
            reason: error.reason,
          },
        },
        status: 422 as const,
      }
    case 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED':
      return {
        body: {
          error_code: error.type,
          error_message: 'trajectory map data type is unsupported',
          details: {
            data_type: error.dataType,
          },
        },
        status: 400 as const,
      }
  }
}
