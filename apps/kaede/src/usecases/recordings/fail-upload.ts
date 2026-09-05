import type { RequestActor } from '../../middleware/request-actor-context.js'
import { recordingUploadStatusSchema } from '../../schemas/common.js'
import type { FailRecordingRequest, RecordingIdParams } from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationById,
  findRecordingAuthorizationByIdForOrganization,
  findRecordingById,
  findRecordingByIdForOrganization,
  markRecordingUploadFailed,
} from '../../services/recordings/index.js'
import { requireRecordingAccess } from '../authorization.js'

const hasSameFailure = (
  stored: unknown,
  errorCode: string,
  message: string,
  missingTargets: string[]
) => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return false
  const failure = stored as Record<string, unknown>
  const storedTargets = Array.isArray(failure.missing_targets) ? failure.missing_targets : []
  return (
    failure.error_code === errorCode &&
    failure.message === message &&
    storedTargets.length === missingTargets.length &&
    storedTargets.every((target, index) => target === missingTargets[index])
  )
}

export const failRecordingUpload = async (
  actor: RequestActor,
  params: RecordingIdParams,
  payload: FailRecordingRequest,
  organizationId?: string
) => {
  const recording = organizationId
    ? await findRecordingByIdForOrganization(params.recordingId, organizationId)
    : await findRecordingById(params.recordingId)
  if (!recording)
    return {
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', recordingId: params.recordingId },
    } as const
  const authRow = organizationId
    ? await findRecordingAuthorizationByIdForOrganization(recording.id, organizationId)
    : await findRecordingAuthorizationById(recording.id)
  if (!authRow)
    return { ok: false, error: { type: 'RECORDING_NOT_FOUND', recordingId: recording.id } } as const
  const auth = requireRecordingAccess(actor, authRow)
  if (!auth.ok) return auth
  const status = recordingUploadStatusSchema.parse(recording.upload_status)
  const missingTargets = payload.missing_targets ?? []
  if (missingTargets.some((target) => !recording.upload_targets.includes(target))) {
    return {
      ok: false,
      error: { type: 'FAILED_REQUEST_INVALID' as const, recordingId: recording.id },
    }
  }
  const failure = {
    error_code: payload.error_code,
    message: payload.message,
    missing_targets: missingTargets,
    occurred_at: new Date().toISOString(),
  }
  if (status === 'failed') {
    return hasSameFailure(
      recording.upload_failure,
      failure.error_code,
      failure.message,
      missingTargets
    )
      ? ({
          ok: true,
          value: { recording_id: recording.id, upload_status: 'failed' as const },
        } as const)
      : ({
          ok: false,
          error: { type: 'RECORDING_UPLOAD_CONFLICT', recordingId: recording.id },
        } as const)
  }
  if (status === 'ready')
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: recording.id,
        uploadStatus: status,
      },
    } as const
  const updated = await markRecordingUploadFailed(recording.id, failure)
  if (!updated) {
    const latest = organizationId
      ? await findRecordingByIdForOrganization(recording.id, organizationId)
      : await findRecordingById(recording.id)
    if (!latest)
      return {
        ok: false,
        error: { type: 'RECORDING_NOT_FOUND', recordingId: recording.id },
      } as const
    const latestStatus = recordingUploadStatusSchema.parse(latest.upload_status)
    if (latestStatus === 'failed') {
      return hasSameFailure(
        latest.upload_failure,
        failure.error_code,
        failure.message,
        missingTargets
      )
        ? ({
            ok: true,
            value: { recording_id: latest.id, upload_status: 'failed' as const },
          } as const)
        : ({
            ok: false,
            error: { type: 'RECORDING_UPLOAD_CONFLICT', recordingId: latest.id },
          } as const)
    }
    if (latestStatus === 'accepted')
      return {
        ok: false,
        error: { type: 'RECORDING_UPLOAD_CONFLICT', recordingId: latest.id },
      } as const
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: latest.id,
        uploadStatus: latestStatus,
      },
    } as const
  }
  return {
    ok: true,
    value: { recording_id: updated.id, upload_status: 'failed' as const },
  } as const
}
