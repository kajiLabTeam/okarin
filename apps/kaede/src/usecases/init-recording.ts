import { recordingUploadStatusSchema } from '../schemas/common.js'
import type { UploadTarget } from '../schemas/common.js'
import type { InitRecordingRequest } from '../schemas/recordings.js'
import { db } from '../services/db/index.js'
import { insertRecording } from '../services/recordings/index.js'
import { issueRecordingUploadUrls } from '../services/storage/index.js'

export type InitRecordingError =
  | {
      type: 'PEDESTRIAN_NOT_FOUND'
      pedestrianId: string
    }
  | {
      type: 'FLOOR_NOT_FOUND'
      floorId: string
    }
export type InitRecordingResult =
  | {
      ok: true
      value: {
        recording_id: string
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

export const initRecording = async (payload: InitRecordingRequest) => {
  const [pedestrian, floor] = await Promise.all([
    db
      .selectFrom('pedestrians')
      .select('id')
      .where('id', '=', payload.pedestrian_id)
      .executeTakeFirst(),
    db.selectFrom('floors').select('id').where('id', '=', payload.floor_id).executeTakeFirst(),
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

  const uploadTargets = withRequiredMetadataTarget(payload.upload_targets)

  const recording = await insertRecording({
    pedestrian_id: payload.pedestrian_id,
    floor_id: payload.floor_id,
    upload_targets: uploadTargets,
  })
  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(recording.id, uploadTargets)

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      upload_status: recordingUploadStatusSchema.parse(recording.upload_status),
      upload_urls: uploadUrls,
      expires_at: expiresAt,
    },
  } satisfies InitRecordingResult
}
