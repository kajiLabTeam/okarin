import type { Transaction } from 'kysely'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'
import { buildRecordingRawObjectKey, validateDataAssetObject } from '../storage/index.js'
import { loadDataTypeDefinition } from './catalog.js'
import {
  insertDataAsset,
  insertDataAssetObject,
  linkRecordingDataAsset,
} from './data-asset-repository.js'
import type { supportedLegacyDataTypes } from './legacy-recording-migration-helpers.js'
import {
  legacyColumnAliases,
  legacySensorTargets,
  unsupportedLegacySensorTargets,
} from './legacy-recording-migration-helpers.js'

type Executor = Transaction<DB>
const migrationName = 'migrate-legacy-recordings-to-data-assets'
type SupportedDataType = (typeof supportedLegacyDataTypes)[number]

export interface LegacyMigrationItem {
  recording_id: string
  data_type: string
  status: 'planned' | 'migrated' | 'already_migrated' | 'skipped' | 'failed'
  reason?: string
}

export interface LegacyMigrationReport {
  migration_name: string
  dry_run: boolean
  scanned_recordings: number
  items: LegacyMigrationItem[]
  missing_items: LegacyMigrationItem[]
  completed: boolean
}

export interface LegacyMigrationOptions {
  dryRun?: boolean
}

export const legacyRecordingMigrationName = migrationName

const findExistingRelation = async (
  recordingId: string,
  dataType: SupportedDataType,
  executor: Executor
) =>
  executor
    .selectFrom('recording_data_assets')
    .select('data_asset_id')
    .where('recording_id', '=', recordingId)
    .where('data_type', '=', dataType)
    .executeTakeFirst()

const migrateItem = async (
  recording: { id: string; organization_id: string },
  dataType: SupportedDataType,
  executor: Executor,
  dryRun: boolean
): Promise<LegacyMigrationItem> => {
  const existing = await findExistingRelation(recording.id, dataType, executor)
  if (existing) {
    return { recording_id: recording.id, data_type: dataType, status: 'already_migrated' }
  }

  const definition = await loadDataTypeDefinition(dataType, '1', 'csv')
  if (!definition) {
    return {
      recording_id: recording.id,
      data_type: dataType,
      status: 'skipped',
      reason: 'data type definition is not available',
    }
  }

  const objectKey = buildRecordingRawObjectKey(recording.organization_id, recording.id, dataType)
  let validation
  try {
    validation = await validateDataAssetObject(objectKey, definition.content_types[0], {
      ...definition,
      column_aliases: legacyColumnAliases,
    })
  } catch {
    return {
      recording_id: recording.id,
      data_type: dataType,
      status: 'failed',
      reason: 'legacy raw object could not be inspected',
    }
  }
  if (!validation.valid) {
    return {
      recording_id: recording.id,
      data_type: dataType,
      status: 'failed',
      reason: 'legacy raw object is missing or failed validation',
    }
  }

  if (dryRun) {
    return {
      recording_id: recording.id,
      data_type: dataType,
      status: 'planned',
    }
  }

  const asset = await insertDataAsset(
    {
      organization_id: recording.organization_id,
      data_type: definition.data_type,
      schema_version: definition.schema_version,
      sample_count: validation.sampleCount ?? null,
      started_at: validation.startedAt ?? null,
      ended_at: validation.endedAt ?? null,
      validation_status: 'valid',
      metadata: JSON.stringify({ format: definition.format, migrated_from: 'recordings.raw' }),
    },
    executor
  )
  await insertDataAssetObject(
    {
      data_asset_id: asset.id,
      object_role: 'primary',
      format: definition.format,
      object_key: objectKey,
      content_type: definition.content_types[0],
      byte_size: validation.byteSize,
      checksum_sha256: validation.checksumSha256,
    },
    executor
  )
  await linkRecordingDataAsset(
    {
      recording_id: recording.id,
      organization_id: recording.organization_id,
      data_asset_id: asset.id,
      data_type: definition.data_type,
      client_asset_key: dataType,
    },
    executor
  )
  return { recording_id: recording.id, data_type: dataType, status: 'migrated' }
}

export const migrateLegacyRecordingsToDataAssets = async (
  options: LegacyMigrationOptions = {}
): Promise<LegacyMigrationReport> => {
  const dryRun = options.dryRun ?? false
  const recordings = await db
    .selectFrom('recordings')
    .select(['id', 'organization_id', 'upload_targets'])
    .where('deleted_at', 'is', null)
    .execute()

  const items: LegacyMigrationItem[] = []
  for (const recording of recordings) {
    for (const dataType of legacySensorTargets(recording.upload_targets)) {
      let item: LegacyMigrationItem
      try {
        item = await db
          .transaction()
          .execute(async (trx) => migrateItem(recording, dataType, trx, dryRun))
      } catch {
        item = {
          recording_id: recording.id,
          data_type: dataType,
          status: 'failed',
          reason: 'database transaction failed',
        }
      }
      items.push(item)
    }
    for (const dataType of unsupportedLegacySensorTargets(recording.upload_targets)) {
      items.push({
        recording_id: recording.id,
        data_type: dataType,
        status: 'skipped',
        reason: 'data type is not supported by the catalog',
      })
    }
  }

  const completed = !items.some((item) => item.status === 'failed' || item.status === 'skipped')
  if (completed && !dryRun) {
    await db
      .insertInto('application_data_migrations')
      .values({ name: migrationName, details: JSON.stringify({ items }) })
      .onConflict((conflict) =>
        conflict.column('name').doUpdateSet({ details: JSON.stringify({ items }) })
      )
      .execute()
  }
  return {
    migration_name: migrationName,
    dry_run: dryRun,
    scanned_recordings: recordings.length,
    items,
    missing_items: items.filter((item) => item.status === 'failed'),
    completed,
  }
}
