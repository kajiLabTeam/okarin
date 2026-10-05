import * as Sentry from '@sentry/node'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { recordingUploadStatusSchema } from '../../schemas/common.js'
import type { UploadTarget } from '../../schemas/common.js'
import type { InitRecordingRequest } from '../../schemas/recordings.js'
import {
  insertDataAsset,
  insertDataAssetObject,
  linkRecordingDataAsset,
  loadDataTypeDefinition,
} from '../../services/data-assets/index.js'
import { db } from '../../services/db/index.js'
import { findFloorById } from '../../services/floors/index.js'
import { findPedestrianById } from '../../services/pedestrians/index.js'
import { insertRecording } from '../../services/recordings/index.js'
import {
  buildDataAssetObjectKey,
  issueDataAssetUploadUrl,
  issueRecordingUploadUrls,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireRecordingAccess } from '../authorization.js'

export type InitRecordingError =
  | AuthorizationError
  | {
      type: 'RESOURCE_NOT_FOUND'
      resourceId: string
    }
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
  | {
      type: 'DATA_TYPE_NOT_SUPPORTED'
      dataType: string
      schemaVersion: string
      format: string
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
          ble?: string
        }
        available_assets?: {
          data_asset_id: string
          data_type: string
          schema_version: string
          object_upload_url: string
        }[]
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

export const initRecording = async (
  actor: RequestActor,
  payload: InitRecordingRequest,
  organizationId?: string
): Promise<InitRecordingResult> => {
  const [pedestrian, floor] = await Promise.all([
    findPedestrianById(payload.pedestrian_id),
    findFloorById(payload.floor_id),
  ])

  if (!pedestrian) {
    return {
      ok: false,
      error: {
        ...(organizationId
          ? { type: 'RESOURCE_NOT_FOUND' as const, resourceId: payload.pedestrian_id }
          : { type: 'PEDESTRIAN_NOT_FOUND' as const, pedestrianId: payload.pedestrian_id }),
      },
    } satisfies InitRecordingResult
  }

  if (!floor) {
    return {
      ok: false,
      error: {
        ...(organizationId
          ? { type: 'RESOURCE_NOT_FOUND' as const, resourceId: payload.floor_id }
          : { type: 'FLOOR_NOT_FOUND' as const, floorId: payload.floor_id }),
      },
    } satisfies InitRecordingResult
  }

  if (!pedestrian.organization_id) {
    throwOrganizationInvariantError(`pedestrian ${pedestrian.id} does not have organization_id`)
  }

  if (!floor.organization_id) {
    throwOrganizationInvariantError(`floor ${floor.id} does not have organization_id`)
  }

  if (organizationId && pedestrian.organization_id !== organizationId) {
    return {
      ok: false,
      error: { type: 'RESOURCE_NOT_FOUND', resourceId: payload.pedestrian_id },
    } satisfies InitRecordingResult
  }

  if (organizationId && floor.organization_id !== organizationId) {
    return {
      ok: false,
      error: { type: 'RESOURCE_NOT_FOUND', resourceId: payload.floor_id },
    } satisfies InitRecordingResult
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

  if (payload.assets) {
    for (const asset of payload.assets) {
      if (!(await loadDataTypeDefinition(asset.data_type, asset.schema_version, asset.format))) {
        return {
          ok: false,
          error: {
            type: 'DATA_TYPE_NOT_SUPPORTED',
            dataType: asset.data_type,
            schemaVersion: asset.schema_version,
            format: asset.format,
          },
        } satisfies InitRecordingResult
      }
    }
  }

  const uploadTargets: UploadTarget[] = payload.upload_targets
    ? withRequiredMetadataTarget(payload.upload_targets)
    : ['metadata']

  let recording: Awaited<ReturnType<typeof insertRecording>>
  let availableAssets:
    | {
        data_asset_id: string
        data_type: string
        schema_version: string
        object_upload_url: string
        format: string
      }[]
    | undefined

  if (payload.assets) {
    const assets = payload.assets
    const result = await db.transaction().execute(async (trx) => {
      const recording = await insertRecording(
        {
          pedestrian_id: payload.pedestrian_id,
          floor_id: payload.floor_id,
          organization_id: pedestrian.organization_id,
          upload_targets: uploadTargets,
          constraints: payload.constraints ?? [],
        },
        trx
      )
      const availableAssets = await Promise.all(
        assets.map(async (asset) => {
          const definition = await loadDataTypeDefinition(
            asset.data_type,
            asset.schema_version,
            asset.format
          )
          if (!definition || definition.content_types.length === 0) {
            throw new Error('catalog definition disappeared during transaction')
          }
          const contentType = definition.content_types[0]
          const dataAsset = await insertDataAsset(
            {
              organization_id: recording.organization_id,
              data_type: asset.data_type,
              schema_version: asset.schema_version,
              metadata: JSON.stringify({ format: asset.format }),
            },
            trx
          )
          await insertDataAssetObject(
            {
              data_asset_id: dataAsset.id,
              object_role: 'primary',
              format: asset.format,
              object_key: buildDataAssetObjectKey(
                recording.organization_id,
                recording.id,
                dataAsset.id,
                asset.format
              ),
              content_type: contentType,
              byte_size: null,
              checksum_sha256: null,
            },
            trx
          )
          await linkRecordingDataAsset(
            {
              recording_id: recording.id,
              organization_id: recording.organization_id,
              data_asset_id: dataAsset.id,
              data_type: asset.data_type,
              client_asset_key: asset.client_asset_key ?? null,
            },
            trx
          )
          return {
            data_asset_id: dataAsset.id,
            data_type: asset.data_type,
            schema_version: asset.schema_version,
            object_upload_url: '',
            format: asset.format,
          }
        })
      )
      return { recording, availableAssets }
    })
    recording = result.recording
    availableAssets = result.availableAssets
  } else {
    recording = await insertRecording({
      pedestrian_id: payload.pedestrian_id,
      floor_id: payload.floor_id,
      organization_id: pedestrian.organization_id,
      upload_targets: uploadTargets,
      constraints: payload.constraints ?? [],
    })
  }
  const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(
    recording.organization_id,
    recording.id,
    uploadTargets
  )

  const availableAssetsWithUrls = availableAssets
    ? await Promise.all(
        availableAssets.map(async (asset) => ({
          data_asset_id: asset.data_asset_id,
          data_type: asset.data_type,
          schema_version: asset.schema_version,
          object_upload_url: await issueDataAssetUploadUrl(
            recording.organization_id,
            recording.id,
            asset.data_asset_id,
            asset.format,
            (await loadDataTypeDefinition(asset.data_type, asset.schema_version, asset.format))
              ?.content_types[0]
          ),
        }))
      )
    : undefined

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      organization_id: recording.organization_id,
      upload_status: recordingUploadStatusSchema.parse(recording.upload_status),
      upload_urls: uploadUrls,
      ...(availableAssetsWithUrls ? { available_assets: availableAssetsWithUrls } : {}),
      expires_at: expiresAt,
    },
  } satisfies InitRecordingResult
}
