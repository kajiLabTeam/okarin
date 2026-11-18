import * as Sentry from '@sentry/node'
import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { uploadTargetsSchema } from '../../schemas/common.js'
import type { RecordingIdParams } from '../../schemas/recordings.js'
import type { CreateTrajectoryRequest } from '../../schemas/trajectories.js'
import { trajectoryConstraintsSchema } from '../../schemas/trajectories.js'
import { findMapRevision } from '../../services/floor-maps/revisions.js'
import { findRecordingById } from '../../services/recordings/index.js'
import { createPositioningAnalysisRun } from '../analysis-runs/create-positioning-analysis-run.js'
import type { AuthorizationError } from '../authorization.js'
import { requireDashboardWriteAccess } from '../authorization.js'

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
      type: 'RECORDING_CONSTRAINTS_INVALID'
      recordingId: string
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

  const authorization = requireDashboardWriteAccess(actor, recording.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  let usedConstraints = payload.constraints
  if (usedConstraints === undefined) {
    const recordingConstraints = trajectoryConstraintsSchema.safeParse(recording.constraints)
    if (!recordingConstraints.success) {
      return {
        ok: false,
        error: {
          type: 'RECORDING_CONSTRAINTS_INVALID',
          recordingId: recording.id,
        },
      }
    }
    usedConstraints = recordingConstraints.data
  }

  const floor = await findMapRevision(
    recording.floor_id,
    recording.organization_id,
    recording.floor_map_revision_id
  )

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

  const trajectoryId = randomUUID()
  try {
    const result = await createPositioningAnalysisRun(
      actor,
      recording.organization_id,
      `trajectory:${trajectoryId}`,
      {
        recording_ids: [recording.id],
        pipeline_ids: ['pdr'],
        parameters_by_pipeline: {},
      },
      { trajectoryId, constraints: usedConstraints }
    )
    if (!result.ok) throw new Error(result.error.type)
  } catch (error) {
    Sentry.captureException(error)
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
        recordingId: recording.id,
        trajectoryId,
      },
    }
  }
  return {
    ok: true,
    value: {
      trajectory_id: trajectoryId,
      recording_id: recording.id,
      organization_id: recording.organization_id,
      status: 'processing',
    },
  }
}
