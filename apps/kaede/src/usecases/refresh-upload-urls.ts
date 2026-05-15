import type { UploadTarget } from '../schemas/common.js'
import { recordingUploadStatusSchema } from '../schemas/common.js'
import type { RefreshUploadUrlsRequest, RecordingIdParams } from '../schemas/recordings.js'
import { findRecordingById } from '../services/recordings/index.js'
import { issueRecordingUploadUrls } from '../services/storage/index.js'

export type RefreshUploadUrlsError =
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN'
      recordingId: string
      uploadStatus: 'accepted' | 'ready' | 'failed'
    }
  | {
      type: 'RECORDING_UPLOAD_TARGETS_INVALID'
      recordingId: string
      invalidTargets: UploadTarget[]
    }

export type RefreshUploadUrlsResult =
  | {
      ok: true
      value: {
        recording_id: string
        upload_status: 'accepted' | 'ready' | 'failed'
        upload_urls: {
          acce?: string
          gyro?: string
          pressure?: string
          wifi?: string
        }
        expires_at: string
      }
    }
  | {
      ok: false
      error: RefreshUploadUrlsError
    }

export const refreshUploadUrls = async (
  params: RecordingIdParams,
  payload: RefreshUploadUrlsRequest
) => {
  const recording = await findRecordingById(params.recordingId)

  if (!recording) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: params.recordingId,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const uploadStatus = recordingUploadStatusSchema.parse(recording.upload_status)
  if (uploadStatus !== 'accepted') {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
        recordingId: recording.id,
        uploadStatus,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const invalidTargets = payload.targets.filter(
    (target) => !recording.upload_targets.includes(target)
  )
  if (invalidTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: recording.id,
        invalidTargets,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(recording.id, payload.targets)

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      upload_status: uploadStatus,
      upload_urls: uploadUrls,
      expires_at: expiresAt,
    },
  } satisfies RefreshUploadUrlsResult
}
