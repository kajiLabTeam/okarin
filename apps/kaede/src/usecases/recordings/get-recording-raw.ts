import type { RequestActor } from '../../middleware/request-actor-context.js'
import { uploadTargetSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { RecordingIdParams, RecordingRawDownloadResponse } from '../../schemas/recordings.js'
import { listRecordingDataAssets } from '../../services/data-assets/index.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
} from '../../services/recordings/index.js'
import {
  buildRecordingRawObjectKey,
  doesObjectExist,
  issueRecordingFileDownloadUrl,
  issueRecordingRawDownloadUrls,
  listRecordingRawObjectKeys,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

export type GetRecordingRawError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_RAW_NOT_FOUND'
      recordingId: string
    }

export type GetRecordingRawResult =
  | {
      ok: true
      value: RecordingRawDownloadResponse
    }
  | {
      ok: false
      error: GetRecordingRawError
    }

export const getRecordingRaw = async (
  actor: RequestActor,
  params: RecordingIdParams
): Promise<GetRecordingRawResult> => {
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

  const authorization = requireOrganizationManager(actor, recordingAuthorization.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  const targetResults = recording.upload_targets.map((target) =>
    uploadTargetSchema.safeParse(target)
  )
  const declaredTargets: UploadTarget[] = targetResults.flatMap((result) =>
    result.success ? [result.data] : []
  )
  const uploadedKeys = new Set(
    await listRecordingRawObjectKeys(recordingAuthorization.organization_id, recording.id)
  )
  const availableTargets = declaredTargets.filter((target) =>
    uploadedKeys.has(
      buildRecordingRawObjectKey(recordingAuthorization.organization_id, recording.id, target)
    )
  )

  // A migrated asset can still point at raw/*.csv. Deduplicate by the stored key,
  // not by data type, so distinct objects of the same type remain downloadable.
  const includedKeys = new Set(
    availableTargets.map((target) =>
      buildRecordingRawObjectKey(recordingAuthorization.organization_id, recording.id, target)
    )
  )
  const assets = await listRecordingDataAssets(recording.id)
  const availableAssets: typeof assets = []
  for (const asset of assets) {
    if (includedKeys.has(asset.object_key)) continue
    // pending assets may not have been uploaded; invalid assets are still raw data.
    if (!(uploadedKeys.has(asset.object_key) || (await doesObjectExist(asset.object_key)))) continue
    includedKeys.add(asset.object_key)
    availableAssets.push(asset)
  }

  if (availableTargets.length === 0 && availableAssets.length === 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_RAW_NOT_FOUND',
        recordingId: recording.id,
      },
    }
  }

  const now = new Date()
  const rawDownload = await issueRecordingRawDownloadUrls(
    recordingAuthorization.organization_id,
    recording.id,
    availableTargets,
    now
  )

  const files: NonNullable<RecordingRawDownloadResponse['files']> = availableTargets.map(
    (target) => {
      const downloadUrl = rawDownload.downloadUrls[target]
      if (!downloadUrl) throw new Error(`Download URL was not issued for ${target}`)
      return {
        data_type: target,
        file_name: `recording-${recording.id}-${target}.${target === 'metadata' ? 'json' : 'csv'}`,
        download_url: downloadUrl,
      }
    }
  )
  for (const asset of availableAssets) {
    const { downloadUrl } = await issueRecordingFileDownloadUrl(asset.object_key, now)
    const dataType = asset.data_type.replace(/[^a-zA-Z0-9._-]/g, '_')
    const format = asset.format.replace(/[^a-zA-Z0-9._-]/g, '_')
    files.push({
      data_type: asset.data_type,
      file_name: `recording-${recording.id}-${dataType}-${asset.data_asset_object_id}.${format}`,
      download_url: downloadUrl,
    })
  }

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      download_urls: rawDownload.downloadUrls,
      files,
      expires_at: rawDownload.expiresAt,
    },
  }
}
