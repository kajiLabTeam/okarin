import * as Sentry from '@sentry/node'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { recordingUploadStatusSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { InitRecordingRequest } from '../../schemas/recordings.js'
import { findFloorById } from '../../services/floors/index.js'
import { findPedestrianById } from '../../services/pedestrians/index.js'
import { insertRecording } from '../../services/recordings/index.js'
import { issueRecordingUploadUrls } from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type InitRecordingError =
  | AuthorizationError
  | {
      type: 'PEDESTRIAN_NOT_FOUND'
      pedestrianId: string
    }
  | {
      type: 'FLOOR_NOT_FOUND'
      floorId: string
    }
  | {
      type: 'RESOURCE_ORGANIZATION_MISMATCH'
      pedestrianId: string
      pedestrianOrganizationId: string
      floorId: string
      floorOrganizationId: string
    }
export type InitRecordingResult =
  | {
      ok: true
      value: {
        recording_id: string
        organization_id: string
        upload_status: 'accepted' | 'ready' | 'failed'
        upload_urls: {
          acce?: string
          gyro?: string
          metadata?: string
          pressure?: string
          wifi?: string
        }
        expires_at: string
      }
    }
  | {
      ok: false
      error: InitRecordingError
    }

const withRequiredMetadataTarget = (targets: UploadTarget[]): UploadTarget[] => {
  if (targets.includes('metadata')) {
    return targets
  }

  return [...targets, 'metadata']
}

const throwOrganizationInvariantError = (message: string): never => {
  const error = new Error(message)
  Sentry.captureException(error)
  throw error
}

export const initRecording = async (actor: RequestActor, payload: InitRecordingRequest) => {
  const [pedestrian, floor] = await Promise.all([
    findPedestrianById(payload.pedestrian_id),
    findFloorById(payload.floor_id),
  ])

  if (!pedestrian) {
    return {
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
        pedestrianId: payload.pedestrian_id,
      },
    } satisfies InitRecordingResult
  }

  if (!floor) {
    return {
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId: payload.floor_id,
      },
    } satisfies InitRecordingResult
  }

  if (!pedestrian.organization_id) {
    throwOrganizationInvariantError(`pedestrian ${pedestrian.id} does not have organization_id`)
  }

  if (!floor.organization_id) {
    throwOrganizationInvariantError(`floor ${floor.id} does not have organization_id`)
  }

  if (pedestrian.organization_id !== floor.organization_id) {
    return {
      ok: false,
      error: {
        type: 'RESOURCE_ORGANIZATION_MISMATCH',
        pedestrianId: pedestrian.id,
        pedestrianOrganizationId: pedestrian.organization_id,
        floorId: floor.id,
        floorOrganizationId: floor.organization_id,
      },
    } satisfies InitRecordingResult
  }

  const authorization = requireRecordingAccess(actor, {
    organization_id: pedestrian.organization_id,
    pedestrian_user_id: pedestrian.user_id,
  })

  if (!authorization.ok) {
    return authorization satisfies InitRecordingResult
  }

  const uploadTargets = withRequiredMetadataTarget(payload.upload_targets)

  const recording = await insertRecording({
    pedestrian_id: payload.pedestrian_id,
    floor_id: payload.floor_id,
    organization_id: pedestrian.organization_id,
    upload_targets: uploadTargets,
  })
  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(recording.id, uploadTargets)

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      organization_id: recording.organization_id,
      upload_status: recordingUploadStatusSchema.parse(recording.upload_status),
      upload_urls: uploadUrls,
      expires_at: expiresAt,
    },
  } satisfies InitRecordingResult
}
