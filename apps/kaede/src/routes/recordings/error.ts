import type { CompleteUploadResult } from '../../usecases/recordings/complete-upload.js'
import type { GetRecordingResult } from '../../usecases/recordings/get-recording.js'
import type { InitRecordingResult } from '../../usecases/recordings/init-recording.js'
import type { ListRecordingTrajectoriesResult } from '../../usecases/recordings/list-recording-trajectories.js'
import type { RefreshUploadUrlsResult } from '../../usecases/recordings/refresh-upload-urls.js'
import type { CreateTrajectoryResult } from '../../usecases/trajectories/create-trajectory.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type InitRecordingError = Extract<InitRecordingResult, { ok: false }>['error']
type CompleteUploadError = Extract<CompleteUploadResult, { ok: false }>['error']
type GetRecordingError = Extract<GetRecordingResult, { ok: false }>['error']
type ListRecordingTrajectoriesError = Extract<
  ListRecordingTrajectoriesResult,
  { ok: false }
>['error']
type RefreshUploadUrlsError = Extract<RefreshUploadUrlsResult, { ok: false }>['error']
type CreateTrajectoryError = Extract<CreateTrajectoryResult, { ok: false }>['error']

export const toInitRecordingErrorResponse = (error: InitRecordingError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'PEDESTRIAN_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'pedestrian_id does not exist',
          details: {
            pedestrian_id: error.pedestrianId,
          },
        },
        status: 404 as const,
      }
    case 'FLOOR_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'floor_id does not exist',
          details: {
            floor_id: error.floorId,
          },
        },
        status: 404 as const,
      }
    case 'RESOURCE_ORGANIZATION_MISMATCH':
      return {
        body: {
          error_code: error.type,
          error_message: 'pedestrian and floor belong to different organizations',
          details: {
            pedestrian_id: error.pedestrianId,
            pedestrian_organization_id: error.pedestrianOrganizationId,
            floor_id: error.floorId,
            floor_organization_id: error.floorOrganizationId,
          },
        },
        status: 409 as const,
      }
  }
}

export const toCompleteUploadErrorResponse = (error: CompleteUploadError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'RECORDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording not found',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 404 as const,
      }
    case 'UPLOAD_TARGETS_MISSING':
      return {
        body: {
          error_code: error.type,
          error_message: 'some upload targets are missing',
          details: {
            recording_id: error.recordingId,
            missing_targets: error.missingTargets,
          },
        },
        status: 409 as const,
      }
    case 'RECORDING_UPLOAD_FINALIZED':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording is already in a terminal upload state',
          details: {
            recording_id: error.recordingId,
            upload_status: error.uploadStatus,
          },
        },
        status: 409 as const,
      }
    case 'RECORDING_UPLOAD_TARGETS_INVALID':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording upload_targets contains invalid values',
          details: {
            recording_id: error.recordingId,
            invalid_targets: error.invalidTargets,
          },
        },
        status: 500 as const,
      }
  }
}

export const toGetRecordingErrorResponse = (error: GetRecordingError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'RECORDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording not found',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 404 as const,
      }
  }
}

export const toListRecordingTrajectoriesErrorResponse = (error: ListRecordingTrajectoriesError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'RECORDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording not found',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 404 as const,
      }
  }
}

export const toRefreshUploadUrlsErrorResponse = (error: RefreshUploadUrlsError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'RECORDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording not found',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 404 as const,
      }
    case 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN':
      return {
        body: {
          error_code: error.type,
          error_message: 'upload url refresh is not allowed in the current upload state',
          details: {
            recording_id: error.recordingId,
            upload_status: error.uploadStatus,
          },
        },
        status: 409 as const,
      }
    case 'RECORDING_UPLOAD_TARGETS_INVALID':
      return {
        body: {
          error_code: error.type,
          error_message: 'requested targets are not allowed for this recording',
          details: {
            recording_id: error.recordingId,
            invalid_targets: error.invalidTargets,
          },
        },
        status: 409 as const,
      }
  }
}

export const toCreateTrajectoryErrorResponse = (error: CreateTrajectoryError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'RECORDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording not found',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 404 as const,
      }
    case 'RECORDING_NOT_READY':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording is not ready for trajectory creation',
          details: {
            recording_id: error.recordingId,
            upload_status: error.uploadStatus,
          },
        },
        status: 409 as const,
      }
    case 'RECORDING_UPLOAD_TARGETS_INVALID':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording upload_targets contains invalid values',
          details: {
            recording_id: error.recordingId,
            invalid_targets: error.invalidTargets,
          },
        },
        status: 500 as const,
      }
    case 'RECORDING_CONSTRAINTS_INVALID':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording constraints contain invalid values',
          details: {
            recording_id: error.recordingId,
          },
        },
        status: 500 as const,
      }
    case 'FLOOR_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording floor not found',
          details: {
            recording_id: error.recordingId,
            floor_id: error.floorId,
          },
        },
        status: 404 as const,
      }
    case 'RESOURCE_ORGANIZATION_MISMATCH':
      return {
        body: {
          error_code: error.type,
          error_message: 'recording and floor belong to different organizations',
          details: {
            recording_id: error.recordingId,
            recording_organization_id: error.recordingOrganizationId,
            floor_id: error.floorId,
            floor_organization_id: error.floorOrganizationId,
          },
        },
        status: 409 as const,
      }
    case 'TRAJECTORY_ANALYZE_PREPARATION_FAILED':
      return {
        body: {
          error_code: error.type,
          error_message: 'failed to prepare analyze request',
          details: {
            recording_id: error.recordingId,
            trajectory_id: error.trajectoryId,
          },
        },
        status: 500 as const,
      }
    case 'NOZOMI_REQUEST_FAILED':
      return {
        body: {
          error_code: error.type,
          error_message: 'failed to submit analyze request to nozomi',
          details: {
            recording_id: error.recordingId,
            trajectory_id: error.trajectoryId,
          },
        },
        status: 502 as const,
      }
  }
}
