import type { RequestActor } from '../../middleware/request-actor-context.js'
import { uploadTargetSchema, recordingUploadStatusSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { RecordingIdParams } from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
  markRecordingUploadReady,
} from '../../services/recordings/index.js'
import {
  buildRecordingRawObjectKey,
  listRecordingRawObjectKeys,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type CompleteUploadError =
  | AuthorizationError
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
  | {
      type: 'RECORDING_UPLOAD_TARGETS_INVALID'
      recordingId: string
      invalidTargets: string[]
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

export const completeUpload = async (
  actor: RequestActor,
  params: RecordingIdParams
): Promise<CompleteUploadResult> => {
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

  const recordingAuthorization = await findRecordingAuthorizationById(recording.id)

  if (!recordingAuthorization) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: recording.id,
      },
    }
  }

  const authorization = requireRecordingAccess(actor, recordingAuthorization)

  if (!authorization.ok) {
    return authorization
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

  const uploadTargetResults = recording.upload_targets.map((target) =>
    uploadTargetSchema.safeParse(target)
  )
  const invalidTargets = recording.upload_targets.filter(
    (_target, index) => !uploadTargetResults[index]?.success
  )

  if (invalidTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: recording.id,
        invalidTargets,
      },
    }
  }

  const uploadTargets: UploadTarget[] = uploadTargetResults.flatMap((result) =>
    result.success ? [result.data] : []
  )
  const uploadedKeysList: string[] = await listRecordingRawObjectKeys(recording.id)
  const uploadedKeys = new Set<string>(uploadedKeysList)
  const missingTargets = uploadTargets.filter(
    (target) => !uploadedKeys.has(buildRecordingRawObjectKey(recording.id, target))
  )

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
    const latest = await findRecordingById(recording.id)
    if (!latest) {
      return {
        ok: false,
        error: {
          type: 'RECORDING_NOT_FOUND',
          recordingId: recording.id,
        },
      }
    }

    const latestUploadStatus = recordingUploadStatusSchema.safeParse(latest.upload_status)
    if (!latestUploadStatus.success || latestUploadStatus.data === 'accepted') {
      return {
        ok: false,
        error: {
          type: 'RECORDING_UPLOAD_TARGETS_INVALID',
          recordingId: latest.id,
          invalidTargets: latest.upload_targets,
        },
      }
    }

    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: recording.id,
        uploadStatus: latestUploadStatus.data,
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
