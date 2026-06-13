import * as Sentry from '@sentry/node'
import { getCallbackRuntimeConfig } from '../config/runtime.js'
import type { RequestActor } from '../middleware/request-actor-context.js'
import { uploadTargetsSchema } from '../schemas/common.js'
import type { RecordingIdParams } from '../schemas/recordings.js'
import type { CreateTrajectoryRequest } from '../schemas/trajectories.js'
import { findFloorById } from '../services/floors/index.js'
import { submitAnalyzeRequest } from '../services/nozomi/index.js'
import { findRecordingAuthorizationById, findRecordingById } from '../services/recordings/index.js'
import {
  issueInternalRecordingRawDownloadUrls,
  issueInternalTrajectoryResultUploadUrl,
} from '../services/storage/index.js'
import { generateCallbackToken } from '../services/trajectories/callback-token.js'
import {
  insertTrajectoryWithConstraints,
  markTrajectoryFailed,
  markTrajectoryProcessing,
} from '../services/trajectories/index.js'
import type { AuthorizationError } from './authorization.js'
import { requireRecordingAccess } from './authorization.js'

export type CreateTrajectoryError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_NOT_READY'
      recordingId: string
      uploadStatus: string
    }
  | {
      type: 'RECORDING_UPLOAD_TARGETS_INVALID'
      recordingId: string
      invalidTargets: string[]
    }
  | {
      type: 'FLOOR_NOT_FOUND'
      floorId: string
      recordingId: string
    }
  | {
      type: 'RESOURCE_ORGANIZATION_MISMATCH'
      recordingId: string
      recordingOrganizationId: string
      floorId: string
      floorOrganizationId: string
    }
  | {
      type: 'NOZOMI_REQUEST_FAILED'
      recordingId: string
      trajectoryId: string
    }
  | {
      type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED'
      recordingId: string
      trajectoryId: string
    }

export type CreateTrajectoryResult =
  | {
      ok: true
      value: {
        trajectory_id: string
        recording_id: string
        organization_id: string
        status: 'processing'
      }
    }
  | {
      ok: false
      error: CreateTrajectoryError
    }

const getCallbackUrl = () => `${getCallbackRuntimeConfig().baseUrl}/api/trajectories/callback`

const throwOrganizationInvariantError = (message: string): never => {
  const error = new Error(message)
  Sentry.captureException(error)
  throw error
}

export const createTrajectory = async (
  actor: RequestActor,
  params: RecordingIdParams,
  payload: CreateTrajectoryRequest
): Promise<CreateTrajectoryResult> => {
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

  if (recording.upload_status !== 'ready') {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_READY',
        recordingId: recording.id,
        uploadStatus: recording.upload_status,
      },
    }
  }

  const uploadTargets = uploadTargetsSchema.safeParse(recording.upload_targets)
  if (!uploadTargets.success) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: recording.id,
        invalidTargets: recording.upload_targets,
      },
    }
  }

  if (!recording.organization_id) {
    throwOrganizationInvariantError(`recording ${recording.id} does not have organization_id`)
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

  const floor = await findFloorById(recording.floor_id)

  if (!floor) {
    return {
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId: recording.floor_id,
        recordingId: recording.id,
      },
    }
  }

  if (!floor.organization_id) {
    throwOrganizationInvariantError(`floor ${floor.id} does not have organization_id`)
  }

  if (recording.organization_id !== floor.organization_id) {
    return {
      ok: false,
      error: {
        type: 'RESOURCE_ORGANIZATION_MISMATCH',
        recordingId: recording.id,
        recordingOrganizationId: recording.organization_id,
        floorId: floor.id,
        floorOrganizationId: floor.organization_id,
      },
    }
  }

  const trajectory = await insertTrajectoryWithConstraints(
    {
      recording_id: recording.id,
      floor_id: recording.floor_id,
      organization_id: recording.organization_id,
      status: 'accepted',
    },
    payload.constraints.map((constraint) => ({
      seq: constraint.seq,
      point_type: constraint.point_type,
      x: constraint.x,
      y: constraint.y,
      direction: constraint.direction ?? null,
      relative_timestamp:
        constraint.point_type === 'waypoint' ? constraint.relative_timestamp : null,
    }))
  )

  const processing = await markTrajectoryProcessing(trajectory.id)
  if (!processing) {
    throw new Error('failed to update trajectory status to processing')
  }

  let rawDataUrls: Awaited<ReturnType<typeof issueInternalRecordingRawDownloadUrls>>['rawDataUrls']
  let resultUploadUrl: string
  let callbackToken: string

  try {
    const [rawDataUrlResult, resultUploadUrlResult, callbackTokenResult] = await Promise.all([
      issueInternalRecordingRawDownloadUrls(recording.id, uploadTargets.data),
      issueInternalTrajectoryResultUploadUrl(processing.id),
      Promise.resolve(generateCallbackToken(processing.id)),
    ])
    rawDataUrls = rawDataUrlResult.rawDataUrls
    resultUploadUrl = resultUploadUrlResult.uploadUrl
    callbackToken = callbackTokenResult
  } catch (error) {
    Sentry.captureException(error)
    await markTrajectoryFailed(
      processing.id,
      'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
      'failed to prepare analyze request'
    )

    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
        recordingId: recording.id,
        trajectoryId: processing.id,
      },
    }
  }

  try {
    const accepted = await submitAnalyzeRequest({
      trajectory_id: processing.id,
      recording_id: recording.id,
      floor_id: recording.floor_id,
      constraints: payload.constraints,
      raw_data_urls: rawDataUrls,
      result_upload_url: resultUploadUrl,
      callback_url: getCallbackUrl(),
      callback_token: callbackToken,
    })

    if (accepted.trajectory_id !== processing.id) {
      throw new Error('unexpected nozomi analyze response')
    }
  } catch (error) {
    Sentry.captureException(error)
    await markTrajectoryFailed(
      processing.id,
      'NOZOMI_REQUEST_FAILED',
      'failed to submit analyze request to nozomi'
    )

    return {
      ok: false,
      error: {
        type: 'NOZOMI_REQUEST_FAILED',
        recordingId: recording.id,
        trajectoryId: processing.id,
      },
    }
  }

  return {
    ok: true,
    value: {
      trajectory_id: processing.id,
      recording_id: processing.recording_id,
      organization_id: processing.organization_id,
      status: 'processing',
    },
  }
}
