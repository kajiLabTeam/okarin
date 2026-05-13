import { recordingUploadStatusSchema } from '../schemas/common.js'
import type { InitRecordingRequest } from '../schemas/recordings.js'
import { db } from '../services/db/index.js'
import { insertRecording } from '../services/recordings/index.js'
import { issueRecordingUploadUrls } from '../services/storage/index.js'

export class PedestrianNotFoundError extends Error {
  constructor(public readonly pedestrianId: string) {
    super('pedestrian_id does not exist')
  }
}

export class FloorNotFoundError extends Error {
  constructor(public readonly floorId: string) {
    super('floor_id does not exist')
  }
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
    throw new PedestrianNotFoundError(payload.pedestrian_id)
  }

  if (!floor) {
    throw new FloorNotFoundError(payload.floor_id)
  }

  const recording = await insertRecording({
    pedestrian_id: payload.pedestrian_id,
    floor_id: payload.floor_id,
    upload_targets: payload.upload_targets,
  })
  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(
    recording.id,
    payload.upload_targets
  )

  return {
    recording_id: recording.id,
    upload_status: recordingUploadStatusSchema.parse(recording.upload_status),
    upload_urls: uploadUrls,
    expires_at: expiresAt,
  }
}
