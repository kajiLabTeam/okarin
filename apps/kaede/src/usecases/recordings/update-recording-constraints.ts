import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  RecordingConstraintsResponse,
  RecordingIdParams,
  UpdateRecordingConstraintsRequest,
} from '../../schemas/recordings.js'
import {
  findRecordingById,
  updateRecordingConstraints as persistRecordingConstraints,
} from '../../services/recordings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireUserDashboardWriteAccess } from '../authorization.js'

export type UpdateRecordingConstraintsError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }

export type UpdateRecordingConstraintsResult =
  | { ok: true; value: RecordingConstraintsResponse }
  | { ok: false; error: UpdateRecordingConstraintsError }

export const updateRecordingConstraints = async (
  actor: RequestActor,
  params: RecordingIdParams,
  payload: UpdateRecordingConstraintsRequest
): Promise<UpdateRecordingConstraintsResult> => {
  const recording = await findRecordingById(params.recordingId)
  if (!recording) {
    return {
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', recordingId: params.recordingId },
    }
  }

  const authorization = requireUserDashboardWriteAccess(actor, recording.organization_id)
  if (!authorization.ok) {
    return authorization
  }

  const updated = await persistRecordingConstraints(recording.id, payload.constraints)
  if (!updated) {
    return {
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', recordingId: recording.id },
    }
  }

  return {
    ok: true,
    value: { recording_id: updated.id, constraints: payload.constraints },
  }
}
