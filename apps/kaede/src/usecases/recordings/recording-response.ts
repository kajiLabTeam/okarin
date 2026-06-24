import type { RecordingDetailResponse } from '../../schemas/recordings.js'
import type { Recording } from '../../services/recordings/index.js'

export const toRecordingDetailResponse = (recording: Recording): RecordingDetailResponse => ({
  recording_id: recording.id,
  pedestrian_id: recording.pedestrian_id,
  floor_id: recording.floor_id,
  organization_id: recording.organization_id,
  upload_status: recording.upload_status as RecordingDetailResponse['upload_status'],
  upload_targets: recording.upload_targets as RecordingDetailResponse['upload_targets'],
  created_at: recording.created_at.toISOString(),
  updated_at: recording.updated_at.toISOString(),
})
