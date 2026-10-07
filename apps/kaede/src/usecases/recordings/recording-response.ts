import type { RecordingDetailResponse } from '../../schemas/recordings.js'
import type { listRecordingDataAssets } from '../../services/data-assets/index.js'
import type { Recording } from '../../services/recordings/index.js'

type RecordingAsset = Awaited<ReturnType<typeof listRecordingDataAssets>>[number]

export const toRecordingDetailResponse = (
  recording: Recording,
  assets: RecordingAsset[] = []
): RecordingDetailResponse => ({
  recording_id: recording.id,
  pedestrian_id: recording.pedestrian_id,
  floor_id: recording.floor_id,
  organization_id: recording.organization_id,
  upload_status: recording.upload_status as RecordingDetailResponse['upload_status'],
  upload_targets: recording.upload_targets as RecordingDetailResponse['upload_targets'],
  ...(assets.length > 0
    ? {
        available_assets: assets.map((asset) => ({
          data_asset_id: asset.data_asset_id,
          data_type: asset.data_type,
          schema_version: asset.schema_version,
          validation_status: asset.validation_status as 'pending' | 'valid' | 'invalid',
          validation_error: asset.validation_error ?? undefined,
          sample_count: asset.sample_count,
          started_at: asset.started_at?.toISOString() ?? null,
          ended_at: asset.ended_at?.toISOString() ?? null,
        })),
      }
    : {}),
  created_at: recording.created_at.toISOString(),
  updated_at: recording.updated_at.toISOString(),
})
