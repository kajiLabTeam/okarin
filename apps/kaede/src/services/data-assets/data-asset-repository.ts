import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import type { DataAssetObjects, DataAssets, RecordingDataAssets } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type Executor = Kysely<DB> | Transaction<DB>
export type DataAsset = Selectable<DataAssets>
export type DataAssetObject = Selectable<DataAssetObjects>
type NewDataAsset = Insertable<DataAssets>
type NewDataAssetObject = Insertable<DataAssetObjects>
type NewRecordingDataAsset = Insertable<RecordingDataAssets>

export const insertDataAsset = (value: NewDataAsset, executor: Executor = db) =>
  executor.insertInto('data_assets').values(value).returningAll().executeTakeFirstOrThrow()

export const insertDataAssetObject = (value: NewDataAssetObject, executor: Executor = db) =>
  executor.insertInto('data_asset_objects').values(value).returningAll().executeTakeFirstOrThrow()

export const linkRecordingDataAsset = (value: NewRecordingDataAsset, executor: Executor = db) =>
  executor
    .insertInto('recording_data_assets')
    .values(value)
    .returningAll()
    .executeTakeFirstOrThrow()

export const updateDataAssetObject = (
  objectId: string,
  patch: Partial<Pick<DataAssetObjects, 'byte_size' | 'checksum_sha256'>>,
  executor: Executor = db
) => executor.updateTable('data_asset_objects').set(patch).where('id', '=', objectId).execute()

export const markDataAssetValid = (assetId: string, executor: Executor = db) =>
  executor
    .updateTable('data_assets')
    .set({ validation_status: 'valid', validation_error: null })
    .where('id', '=', assetId)
    .execute()

export const updateDataAssetValidated = (
  assetId: string,
  values: { sample_count: number | null; started_at: Date | null; ended_at: Date | null },
  executor: Executor = db
) =>
  executor
    .updateTable('data_assets')
    .set({ ...values, validation_status: 'valid', validation_error: null })
    .where('id', '=', assetId)
    .execute()

export const markDataAssetInvalid = (assetId: string, error: object, executor: Executor = db) =>
  executor
    .updateTable('data_assets')
    .set({ validation_status: 'invalid', validation_error: JSON.stringify(error) })
    .where('id', '=', assetId)
    .execute()

export const listRecordingDataAssets = async (recordingId: string, executor: Executor = db) =>
  executor
    .selectFrom('recording_data_assets as relation')
    .innerJoin('data_assets as asset', 'asset.id', 'relation.data_asset_id')
    .innerJoin('data_asset_objects as asset_object', 'asset_object.data_asset_id', 'asset.id')
    .select([
      'asset.id as data_asset_id',
      'asset.data_type',
      'asset.schema_version',
      'asset.validation_status',
      'asset.validation_error',
      'asset.sample_count',
      'asset.started_at',
      'asset.ended_at',
      'relation.client_asset_key',
      'asset_object.id as data_asset_object_id',
      'asset_object.object_key',
      'asset_object.checksum_sha256',
      'asset_object.content_type',
      'asset_object.format',
    ])
    .where('relation.recording_id', '=', recordingId)
    .orderBy('asset.data_type')
    .execute()
