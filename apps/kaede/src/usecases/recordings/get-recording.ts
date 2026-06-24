import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { RecordingDetailResponse, RecordingIdParams } from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
} from '../../services/recordings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'
import { toRecordingDetailResponse } from './recording-response.js'

export type GetRecordingError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }

export type GetRecordingResult =
  | {
      ok: true
      value: RecordingDetailResponse
    }
  | {
      ok: false
      error: GetRecordingError
    }

export const getRecording = async (
  actor: RequestActor,
  params: RecordingIdParams
): Promise<GetRecordingResult> => {
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

  return {
    ok: true,
    value: toRecordingDetailResponse(recording),
  }
}
