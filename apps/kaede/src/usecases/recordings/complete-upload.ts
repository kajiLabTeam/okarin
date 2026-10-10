import type { RequestActor } from '../../middleware/request-actor-context.js'
import { uploadTargetSchema, recordingUploadStatusSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { RecordingIdParams } from '../../schemas/recordings.js'
import {
  listRecordingDataAssets,
  markDataAssetInvalid,
  updateDataAssetObject,
  updateDataAssetValidated,
  loadDataTypeDefinition,
} from '../../services/data-assets/index.js'
import { db } from '../../services/db/index.js'
import {
  findRecordingAuthorizationById,
  findRecordingAuthorizationByIdForOrganization,
  findRecordingById,
  findRecordingByIdForUpdate,
  findRecordingByIdForOrganization,
  markRecordingUploadReady,
  updateRecording,
} from '../../services/recordings/index.js'
import {
  buildRecordingRawObjectKey,
  listRecordingRawObjectKeys,
  validateBleCsvObject,
  validateMetadataObject,
  validateDataAssetObject,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type CompleteUploadError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'RECORDING_UPLOAD_FINALIZED'
      recordingId: string
      uploadStatus: 'ready' | 'failed'
    }
  | {
      type: 'UPLOAD_TARGETS_MISSING'
      recordingId: string
      missingTargets: UploadTarget[]
    }
  | {
      type: 'RECORDING_UPLOAD_TARGETS_INVALID'
      recordingId: string
      invalidTargets: string[]
    }
  | {
      type: 'UPLOAD_FILE_INVALID'
      recordingId: string
    }

export type CompleteUploadResult =
  | {
      ok: true
      value: {
        recording_id: string
        upload_status: 'ready'
      }
    }
  | {
      ok: false
      error: CompleteUploadError
    }

export const completeUpload = async (
  actor: RequestActor,
  params: RecordingIdParams,
  organizationId?: string
): Promise<CompleteUploadResult> => {
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
    }
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
    }
  }

  const authorization = requireRecordingAccess(actor, recordingAuthorization)

  if (!authorization.ok) {
    return authorization
  }

  if (recording.upload_status === 'ready') {
    return {
      ok: true,
      value: { recording_id: recording.id, upload_status: 'ready' },
    }
  }

  if (recording.upload_status === 'failed') {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: recording.id,
        uploadStatus: recording.upload_status,
      },
    }
  }

  const uploadTargetResults = recording.upload_targets.map((target) =>
    uploadTargetSchema.safeParse(target)
  )
  const invalidTargets = recording.upload_targets.filter(
    (_target, index) => !uploadTargetResults[index]?.success
  )

  if (invalidTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: recording.id,
        invalidTargets,
      },
    }
  }

  const uploadTargets: UploadTarget[] = uploadTargetResults.flatMap((result) =>
    result.success ? [result.data] : []
  )
  const uploadedKeysList: string[] = await listRecordingRawObjectKeys(
    recordingAuthorization.organization_id,
    recording.id
  )
  const uploadedKeys = new Set<string>(uploadedKeysList)
  const missingTargets = uploadTargets.filter(
    (target) =>
      !uploadedKeys.has(
        buildRecordingRawObjectKey(recordingAuthorization.organization_id, recording.id, target)
      )
  )

  if (missingTargets.length > 0) {
    return {
      ok: false,
      error: {
        type: 'UPLOAD_TARGETS_MISSING',
        recordingId: recording.id,
        missingTargets,
      },
    }
  }

  if (!(await validateMetadataObject(recordingAuthorization.organization_id, recording.id))) {
    return { ok: false, error: { type: 'UPLOAD_FILE_INVALID', recordingId: recording.id } }
  }

  if (uploadTargets.includes('ble')) {
    const valid = await validateBleCsvObject(recordingAuthorization.organization_id, recording.id)
    if (!valid) {
      return { ok: false, error: { type: 'UPLOAD_FILE_INVALID', recordingId: recording.id } }
    }
  }

  const dataAssets = await listRecordingDataAssets(recording.id)
  if (dataAssets.length > 0) {
    interface AssetValidation {
      asset: (typeof dataAssets)[number]
      validation:
        | Awaited<ReturnType<typeof validateDataAssetObject>>
        | { valid: false; code: string }
    }
    const assetValidations: AssetValidation[] = []
    for (const asset of dataAssets) {
      const definition = await loadDataTypeDefinition(
        asset.data_type,
        asset.schema_version,
        asset.format
      )
      if (!definition) {
        assetValidations.push({
          asset,
          validation: { valid: false, code: 'DATA_TYPE_NOT_SUPPORTED' } as const,
        })
        continue
      }
      const validation = await validateDataAssetObject(
        asset.object_key,
        asset.content_type,
        definition
      )
      assetValidations.push({ asset, validation })
    }
    const hasInvalidAsset = assetValidations.some(({ asset, validation }) => {
      if (validation.valid) return false
      return !(
        asset.data_type === 'ble' &&
        'code' in validation &&
        validation.code === 'NO_SAMPLES'
      )
    })
    const finalized = await db.transaction().execute(async (trx) => {
      const latest = await findRecordingByIdForUpdate(recording.id, trx)
      if (latest?.upload_status !== 'accepted') return { recording: latest, updated: false }
      for (const { asset, validation } of assetValidations) {
        if (!validation.valid) {
          await markDataAssetInvalid(
            asset.data_asset_id,
            { code: 'code' in validation ? validation.code : 'ASSET_STRUCTURE_INVALID' },
            trx
          )
          continue
        }
        await updateDataAssetObject(
          asset.data_asset_object_id,
          {
            byte_size: validation.byteSize,
            checksum_sha256: validation.checksumSha256,
          },
          trx
        )
        await updateDataAssetValidated(
          asset.data_asset_id,
          {
            sample_count: validation.sampleCount ?? null,
            started_at: validation.startedAt ?? null,
            ended_at: validation.endedAt ?? null,
          },
          trx
        )
      }
      if (hasInvalidAsset) {
        await updateRecording(
          recording.id,
          {
            upload_failure: JSON.stringify({ code: 'ASSET_STRUCTURE_INVALID' }),
          },
          trx
        )
      } else {
        await updateRecording(recording.id, { upload_status: 'ready', upload_failure: null }, trx)
      }
      return { recording: await findRecordingById(recording.id, trx), updated: true }
    })
    if (!finalized.recording) {
      return {
        ok: false,
        error: { type: 'RECORDING_NOT_FOUND', recordingId: recording.id },
      }
    }
    if (hasInvalidAsset) {
      return { ok: false, error: { type: 'UPLOAD_FILE_INVALID', recordingId: recording.id } }
    }
    if (!finalized.updated) {
      return {
        ok: false,
        error: {
          type: 'RECORDING_UPLOAD_FINALIZED',
          recordingId: finalized.recording.id,
          uploadStatus: finalized.recording.upload_status as 'ready' | 'failed',
        },
      }
    }
    return {
      ok: true,
      value: { recording_id: finalized.recording.id, upload_status: 'ready' },
    }
  }

  const updated = await markRecordingUploadReady(recording.id)
  if (!updated) {
    const latest = await findRecordingById(recording.id)
    if (!latest) {
      return {
        ok: false,
        error: {
          type: 'RECORDING_NOT_FOUND',
          recordingId: recording.id,
        },
      }
    }

    const latestUploadStatus = recordingUploadStatusSchema.safeParse(latest.upload_status)
    if (!latestUploadStatus.success || latestUploadStatus.data === 'accepted') {
      return {
        ok: false,
        error: {
          type: 'RECORDING_UPLOAD_TARGETS_INVALID',
          recordingId: latest.id,
          invalidTargets: latest.upload_targets,
        },
      }
    }

    return {
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: recording.id,
        uploadStatus: latestUploadStatus.data,
      },
    }
  }

  return {
    ok: true,
    value: {
      recording_id: updated.id,
      upload_status: 'ready',
    },
  }
}
