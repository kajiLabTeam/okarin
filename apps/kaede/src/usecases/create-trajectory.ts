import * as Sentry from '@sentry/node'
import { getCallbackRuntimeConfig } from '../config/runtime.js'
import { uploadTargetsSchema } from '../schemas/common.js'
import type { RecordingIdParams } from '../schemas/recordings.js'
import type { CreateTrajectoryRequest } from '../schemas/trajectories.js'
import { db } from '../services/db/index.js'
import { submitAnalyzeRequest } from '../services/nozomi/index.js'
import { findRecordingById } from '../services/recordings/index.js'
import {
  issueInternalRecordingRawDownloadUrls,
  issueInternalTrajectoryResultUploadUrl,
} from '../services/storage/index.js'
import { generateCallbackToken } from '../services/trajectories/callback-token.js'
import {
  insertTrajectory,
  insertTrajectoryConstraints,
  markTrajectoryFailed,
  markTrajectoryProcessing,
} from '../services/trajectories/index.js'

export type CreateTrajectoryError =
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
        status: 'processing'
      }
    }
  | {
      ok: false
      error: CreateTrajectoryError
    }

const getCallbackUrl = () => `${getCallbackRuntimeConfig().baseUrl}/api/trajectories/callback`

export const createTrajectory = async (
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

  const trajectory = await db.transaction().execute(async (trx) => {
    const insertedTrajectory = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: recording.floor_id,
        status: 'accepted',
      },
      trx
    )

    await insertTrajectoryConstraints(
      payload.constraints.map((constraint) => ({
        trajectory_id: insertedTrajectory.id,
        seq: constraint.seq,
        point_type: constraint.point_type,
        x: constraint.x,
        y: constraint.y,
        direction: constraint.direction ?? null,
        relative_timestamp:
          constraint.point_type === 'waypoint' ? constraint.relative_timestamp : null,
      })),
      trx
    )

    return insertedTrajectory
  })

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
      status: 'processing',
    },
  }
}
