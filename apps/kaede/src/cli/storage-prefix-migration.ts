import { CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { appendFile, readFile } from 'node:fs/promises'
import { getAppRuntimeConfig } from '../config/runtime.js'
import {
  buildFloorMapObjectKey,
  buildTrajectoryAnalyzedResultObjectKey,
  getFloorMapExtensionFromObjectKey,
} from '../services/storage/index.js'
import { getS3Context } from '../services/storage/s3-client.js'
import {
  countInFlightTrajectories,
  listFloorMapMigrationRows,
  listTrajectoryResultMigrationRows,
  switchFloorMapPath,
} from '../services/storage-prefix-migration/repository.js'
import type { MigrationRow } from '../services/storage-prefix-migration/repository.js'

type Resource = 'floor-maps' | 'trajectory-results'
type Status = 'planned' | 'verified' | 'failed' | 'skipped'

interface Options {
  command: 'plan' | 'copy' | 'verify' | 'report'
  resource?: Resource
  dryRun: boolean
  resourceId?: string
  organizationId?: string
  limit: number
  concurrency: number
  retries: number
  manifest: string
}

interface ManifestRecord {
  timestamp: string
  environment: string
  bucket: string
  revision: string
  resource_type: MigrationRow['resourceType']
  resource_id: string
  organization_id: string
  source_key: string
  destination_key: string
  source_size?: number
  destination_size?: number
  content_type?: string
  status: Status
  message?: string
}

const usage = () => {
  throw new Error(
    'usage: storage-prefix-migration <plan|copy|verify|report> [--resource floor-maps|trajectory-results] [--dry-run] [--resource-id UUID] [--organization-id UUID] [--limit N] [--concurrency N] [--retries N] [--manifest PATH]'
  )
}

const positiveInteger = (value: string | undefined, name: string) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be positive`)
  return parsed
}

export const parseOptions = (argv: string[]): Options => {
  const command = argv.shift()
  if (!command || !['plan', 'copy', 'verify', 'report'].includes(command)) usage()
  const options: Options = {
    command: command as Options['command'],
    dryRun: false,
    limit: 1000,
    concurrency: 4,
    retries: 3,
    manifest: 'storage-prefix-migration-manifest.jsonl',
  }

  while (argv.length) {
    const flag = argv.shift()
    if (flag === '--dry-run') options.dryRun = true
    else if (flag === '--resource') options.resource = argv.shift() as Resource
    else if (flag === '--resource-id') options.resourceId = argv.shift()
    else if (flag === '--organization-id') options.organizationId = argv.shift()
    else if (flag === '--limit') options.limit = positiveInteger(argv.shift(), '--limit')
    else if (flag === '--concurrency') {
      options.concurrency = positiveInteger(argv.shift(), '--concurrency')
    } else if (flag === '--retries') options.retries = positiveInteger(argv.shift(), '--retries')
    else if (flag === '--manifest') options.manifest = argv.shift() ?? usage()
    else usage()
  }

  if (options.resource && !['floor-maps', 'trajectory-results'].includes(options.resource)) usage()
  if (options.command === 'copy' && !options.resource) usage()
  return options
}

const destinationKey = (row: MigrationRow) => {
  if (row.resourceType === 'trajectory_result') {
    return buildTrajectoryAnalyzedResultObjectKey(row.organizationId, row.resourceId)
  }
  const extension = getFloorMapExtensionFromObjectKey(row.sourceKey)
  if (!extension) throw new Error(`unsupported floor map extension: ${row.sourceKey}`)
  return buildFloorMapObjectKey(row.organizationId, row.resourceId, extension)
}

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'NotFound' || error.name === 'NoSuchKey')

const head = async (key: string): Promise<HeadObjectCommandOutput | undefined> => {
  const { config, internalClient } = getS3Context()
  try {
    return await internalClient.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

const matchingMetadata = (source: HeadObjectCommandOutput, destination: HeadObjectCommandOutput) =>
  source.ContentLength === destination.ContentLength &&
  source.ContentType === destination.ContentType

const retry = async <T>(attempts: number, operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

const baseRecord = (row: MigrationRow, destination: string): Omit<ManifestRecord, 'status'> => {
  const { env: environment, revision } = getAppRuntimeConfig()
  return {
    timestamp: new Date().toISOString(),
    environment,
    bucket: getS3Context().config.bucket,
    revision,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    organization_id: row.organizationId,
    source_key: row.sourceKey,
    destination_key: destination,
  }
}

const writeRecord = async (path: string, record: ManifestRecord) => {
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
  process.stdout.write(`${JSON.stringify(record)}\n`)
}

const loadRows = async (options: Options): Promise<MigrationRow[]> => {
  const filters = {
    resourceId: options.resourceId,
    organizationId: options.organizationId,
    limit: options.limit,
  }
  if (options.resource === 'floor-maps') return listFloorMapMigrationRows(filters)
  if (options.resource === 'trajectory-results') return listTrajectoryResultMigrationRows(filters)
  const [floors, trajectories] = await Promise.all([
    listFloorMapMigrationRows(filters),
    listTrajectoryResultMigrationRows(filters),
  ])
  return [...floors, ...trajectories].slice(0, options.limit)
}

const migrateOne = async (row: MigrationRow, options: Options): Promise<Status> => {
  const destination = destinationKey(row)
  const base = baseRecord(row, destination)
  if (options.command === 'plan' || options.dryRun) {
    const [source, destinationHead] = await Promise.all([head(row.sourceKey), head(destination)])
    const status = source
      ? destinationHead && !matchingMetadata(source, destinationHead)
        ? 'failed'
        : 'planned'
      : row.resourceType === 'trajectory_result' && row.status === 'failed'
        ? 'skipped'
        : 'failed'
    await writeRecord(options.manifest, {
      ...base,
      source_size: source?.ContentLength,
      destination_size: destinationHead?.ContentLength,
      content_type: source?.ContentType,
      status,
      message: !source
        ? 'source object does not exist'
        : destinationHead
          ? matchingMetadata(source, destinationHead)
            ? 'destination already exists and metadata matches'
            : 'destination already exists but metadata differs'
          : undefined,
    })
    return status
  }

  try {
    const source = await head(row.sourceKey)
    if (!source) {
      if (row.resourceType === 'trajectory_result' && row.status === 'failed') {
        await writeRecord(options.manifest, {
          ...base,
          status: 'skipped',
          message: 'failed trajectory has no source object',
        })
        return 'skipped'
      }
      throw new Error('source object does not exist')
    }
    let destinationHead = await head(destination)

    if (options.command === 'copy' && !destinationHead) {
      const { config, internalClient } = getS3Context()
      await retry(options.retries, () =>
        internalClient.send(
          new CopyObjectCommand({
            Bucket: config.bucket,
            Key: destination,
            CopySource: `${config.bucket}/${encodeURIComponent(row.sourceKey).replaceAll('%2F', '/')}`,
          })
        )
      )
      destinationHead = await head(destination)
    }

    if (!destinationHead) throw new Error('destination object does not exist')
    if (!matchingMetadata(source, destinationHead)) throw new Error('size or content type mismatch')

    if (
      options.command === 'verify' &&
      row.resourceType === 'floor_map' &&
      row.currentKey !== destination
    ) {
      throw new Error('floor image_object_path does not reference destination')
    }

    if (options.command === 'copy' && row.resourceType === 'floor_map') {
      const switched =
        row.currentKey === destination ||
        (await switchFloorMapPath(row.resourceId, row.currentKey, destination))
      if (!switched) throw new Error('floor image_object_path conditional update failed')
    }

    await writeRecord(options.manifest, {
      ...base,
      source_size: source.ContentLength,
      destination_size: destinationHead.ContentLength,
      content_type: source.ContentType,
      status: 'verified',
    })
    return 'verified'
  } catch (error) {
    await writeRecord(options.manifest, {
      ...base,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    })
    return 'failed'
  }
}

const runPool = async (rows: MigrationRow[], options: Options) => {
  let index = 0
  const statuses: Status[] = []
  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, rows.length) }, async () => {
      while (index < rows.length) {
        const row = rows[index]
        index += 1
        statuses.push(await migrateOne(row, options))
      }
    })
  )
  return statuses
}

const report = async (path: string) => {
  const content = await readFile(path, 'utf8')
  const latest = new Map<string, ManifestRecord>()
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line) as ManifestRecord
    latest.set(`${record.resource_type}:${record.resource_id}`, record)
  }
  const counts: Record<string, number> = {}
  for (const record of latest.values()) {
    counts[record.status] = (counts[record.status] ?? 0) + 1
  }
  process.stdout.write(`${JSON.stringify({ manifest: path, resources: latest.size, counts })}\n`)
}

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseOptions([...argv])
  const { config } = getS3Context()
  const app = getAppRuntimeConfig()
  process.stderr.write(
    `${JSON.stringify({ command: options.command, environment: app.env, bucket: config.bucket, dry_run: options.dryRun })}\n`
  )
  if (options.command === 'report') return report(options.manifest)
  if (
    (options.command === 'copy' || options.command === 'verify') &&
    (await countInFlightTrajectories()) > 0
  ) {
    throw new Error('accepted or processing trajectories exist; migration refused')
  }
  const statuses = await runPool(await loadRows(options), options)
  const failedCount = statuses.filter((status) => status === 'failed').length
  if (failedCount > 0) {
    throw new Error(`storage prefix migration failed for ${failedCount} resource(s)`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
