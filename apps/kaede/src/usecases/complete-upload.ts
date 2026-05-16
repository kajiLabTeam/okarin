import { uploadTargetSchema } from '../schemas/common.js'
import type { UploadTarget } from '../schemas/common.js'
import type { RecordingIdParams } from '../schemas/recordings.js'
import { findRecordingById, markRecordingUploadReady } from '../services/recordings/index.js'
import { doesRecordingRawObjectExist } from '../services/storage/index.js'

export type CompleteUploadError =
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_UPLOAD_FINALIZED'
      recordingId: string
      uploadStatus: 'ready' | 'failed'
    }
  | {
      type: 'UPLOAD_TARGETS_MISSING'
      recordingId: string
      missingTargets: UploadTarget[]
    }

export type CompleteUploadResult =
  | {
      ok: true
      value: {
        recording_id: string
        upload_status: 'ready'
      }
    }
  | {
      ok: false
      error: CompleteUploadError
    }

export const completeUpload = async (params: RecordingIdParams): Promise<CompleteUploadResult> => {
  const recording = await findRecordingById(params.recordingId)

  if (!recording) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: params.recordingId,
      },
    }
  }

  if (recording.upload_status === 'ready' || recording.upload_status === 'failed') {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: recording.id,
        uploadStatus: recording.upload_status,
      },
    }
  }

  const uploadTargets = recording.upload_targets.map((target) => uploadTargetSchema.parse(target))
  const existenceResults = await Promise.all(
    uploadTargets.map(async (target) => ({
      target,
      exists: await doesRecordingRawObjectExist(recording.id, target),
    }))
  )

  const missingTargets = existenceResults
    .filter((result) => !result.exists)
    .map((result) => result.target)

  if (missingTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'UPLOAD_TARGETS_MISSING',
        recordingId: recording.id,
        missingTargets,
      },
    }
  }

  const updated = await markRecordingUploadReady(recording.id)
  if (!updated) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: recording.id,
      },
    }
  }

  return {
    ok: true,
    value: {
      recording_id: updated.id,
      upload_status: 'ready',
    },
  }
}
