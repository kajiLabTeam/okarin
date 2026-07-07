import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { RecordingConstraintsResponse, RecordingIdParams } from '../../schemas/recordings.js'
import { trajectoryConstraintsSchema } from '../../schemas/trajectories.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
} from '../../services/recordings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type GetRecordingConstraintsError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_CONSTRAINTS_INVALID'
      recordingId: string
    }

export type GetRecordingConstraintsResult =
  | { ok: true; value: RecordingConstraintsResponse }
  | { ok: false; error: GetRecordingConstraintsError }

export const getRecordingConstraints = async (
  actor: RequestActor,
  params: RecordingIdParams
): Promise<GetRecordingConstraintsResult> => {
  const recording = await findRecordingById(params.recordingId)

  if (!recording) {
    return {
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', recordingId: params.recordingId },
    }
  }

  const recordingAuthorization = await findRecordingAuthorizationById(recording.id)
  if (!recordingAuthorization) {
    return {
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', recordingId: recording.id },
    }
  }

  const authorization = requireRecordingAccess(actor, recordingAuthorization)
  if (!authorization.ok) {
    return authorization
  }

  const constraints = trajectoryConstraintsSchema.safeParse(recording.constraints)
  if (!constraints.success) {
    return {
      ok: false,
      error: { type: 'RECORDING_CONSTRAINTS_INVALID', recordingId: recording.id },
    }
  }

  return {
    ok: true,
    value: { recording_id: recording.id, constraints: constraints.data },
  }
}
