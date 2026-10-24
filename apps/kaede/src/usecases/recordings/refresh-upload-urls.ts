import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { UploadTarget } from '../../schemas/common.js'
import { recordingUploadStatusSchema } from '../../schemas/common.js'
import type { RefreshUploadUrlsRequest, RecordingIdParams } from '../../schemas/recordings.js'
import { listRecordingDataAssets } from '../../services/data-assets/index.js'
import {
  findRecordingAuthorizationById,
  findRecordingAuthorizationByIdForOrganization,
  findRecordingById,
  findRecordingByIdForOrganization,
} from '../../services/recordings/index.js'
import { issueDataAssetUploadUrl, issueRecordingUploadUrls } from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type RefreshUploadUrlsError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN'
      recordingId: string
      uploadStatus: 'accepted' | 'ready' | 'failed'
    }
  | {
      type: 'RECORDING_UPLOAD_TARGETS_INVALID'
      recordingId: string
      invalidTargets: UploadTarget[]
    }

export type RefreshUploadUrlsResult =
  | {
      ok: true
      value: {
        recording_id: string
        upload_status: 'accepted' | 'ready' | 'failed'
        upload_urls: {
          acce?: string
          gyro?: string
          pressure?: string
          wifi?: string
          ble?: string
        }
        asset_upload_urls: {
          acce?: string
          gyro?: string
          ble?: string
        }
        expires_at: string
      }
    }
  | {
      ok: false
      error: RefreshUploadUrlsError
    }

export const refreshUploadUrls = async (
  actor: RequestActor,
  params: RecordingIdParams,
  payload: RefreshUploadUrlsRequest,
  organizationId?: string
) => {
  const recording = organizationId
    ? await findRecordingByIdForOrganization(params.recordingId, organizationId)
    : await findRecordingById(params.recordingId)

  if (!recording) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: params.recordingId,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const recordingAuthorization = organizationId
    ? await findRecordingAuthorizationByIdForOrganization(recording.id, organizationId)
    : await findRecordingAuthorizationById(recording.id)

  if (!recordingAuthorization) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: recording.id,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const authorization = requireRecordingAccess(actor, recordingAuthorization)

  if (!authorization.ok) {
    return authorization satisfies RefreshUploadUrlsResult
  }

  const uploadStatus = recordingUploadStatusSchema.parse(recording.upload_status)
  if (uploadStatus !== 'accepted') {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
        recordingId: recording.id,
        uploadStatus,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const dataAssets = await listRecordingDataAssets(recording.id)
  const assetTypes = new Set<UploadTarget>(
    dataAssets
      .map((asset) => asset.data_type)
      .filter((value): value is UploadTarget => ['acce', 'gyro', 'ble'].includes(value))
  )
  const invalidTargets = payload.targets.filter(
    (target) => !recording.upload_targets.includes(target) && !assetTypes.has(target)
  )
  if (invalidTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: recording.id,
        invalidTargets,
      },
    } satisfies RefreshUploadUrlsResult
  }

  const rawTargets = payload.targets.filter((target) => !assetTypes.has(target))
  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(
    recordingAuthorization.organization_id,
    recording.id,
    rawTargets
  )
  const assetUploadUrls: Record<string, string> = {}
  await Promise.all(
    payload.targets
      .filter((target) => assetTypes.has(target))
      .map(async (target) => {
        const asset = dataAssets.find((candidate) => candidate.data_type === target)
        if (!asset) return
        assetUploadUrls[target] = await issueDataAssetUploadUrl(
          recordingAuthorization.organization_id,
          recording.id,
          asset.data_asset_id,
          asset.format,
          asset.content_type
        )
      })
  )

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      upload_status: uploadStatus,
      upload_urls: uploadUrls,
      asset_upload_urls: assetUploadUrls,
      expires_at: expiresAt,
    },
  } satisfies RefreshUploadUrlsResult
}
