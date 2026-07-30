import type { RequestActor } from '../../middleware/request-actor-context.js'
import { uploadTargetSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { RecordingIdParams, RecordingRawDownloadResponse } from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
} from '../../services/recordings/index.js'
import {
  buildRecordingRawObjectKey,
  issueRecordingRawDownloadUrls,
  listRecordingRawObjectKeys,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

export type GetRecordingRawError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_RAW_NOT_FOUND'
      recordingId: string
    }

export type GetRecordingRawResult =
  | {
      ok: true
      value: RecordingRawDownloadResponse
    }
  | {
      ok: false
      error: GetRecordingRawError
    }

export const getRecordingRaw = async (
  actor: RequestActor,
  params: RecordingIdParams
): Promise<GetRecordingRawResult> => {
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

  const authorization = requireOrganizationManager(actor, recordingAuthorization.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  const targetResults = recording.upload_targets.map((target) =>
    uploadTargetSchema.safeParse(target)
  )
  const declaredTargets: UploadTarget[] = targetResults.flatMap((result) =>
    result.success ? [result.data] : []
  )
  const uploadedKeys = new Set(
    await listRecordingRawObjectKeys(recordingAuthorization.organization_id, recording.id)
  )
  const availableTargets = declaredTargets.filter((target) =>
    uploadedKeys.has(
      buildRecordingRawObjectKey(recordingAuthorization.organization_id, recording.id, target)
    )
  )

  if (availableTargets.length === 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_RAW_NOT_FOUND',
        recordingId: recording.id,
      },
    }
  }

  const rawDownload = await issueRecordingRawDownloadUrls(
    recordingAuthorization.organization_id,
    recording.id,
    availableTargets
  )

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      download_urls: rawDownload.downloadUrls,
      expires_at: rawDownload.expiresAt,
    },
  }
}
