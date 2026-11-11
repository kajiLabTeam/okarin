import { sql } from 'kysely'
import type { Insertable, Selectable } from 'kysely'
import type { PaginationOptions } from '../../schemas/pagination.js'
import type { Json, PositioningAnalysisRunItems, PositioningAnalysisRuns } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type PositioningRun = Selectable<PositioningAnalysisRuns>
export type PositioningRunItem = Selectable<PositioningAnalysisRunItems>
type NewRun = Omit<Insertable<PositioningAnalysisRuns>, 'id'>
type NewItem = Omit<Insertable<PositioningAnalysisRunItems>, 'id'>
const json = (value: unknown) => JSON.stringify(value) as Json

export const findPositioningRunByKey = (
  organizationId: string,
  key: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('positioning_analysis_runs')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst()

export const insertPositioningRun = (run: NewRun, executor: DbExecutor = db) =>
  executor
    .insertInto('positioning_analysis_runs')
    .values(run)
    .returningAll()
    .executeTakeFirstOrThrow()

export const insertPositioningItems = (
  items: (Omit<
    NewItem,
    'slot_bindings' | 'pipeline_snapshot' | 'parameters' | 'input_manifest' | 'error'
  > & {
    slot_bindings: unknown
    pipeline_snapshot: unknown
    parameters: unknown
    input_manifest: unknown
    error?: unknown
  })[],
  executor: DbExecutor = db
) =>
  executor
    .insertInto('positioning_analysis_run_items')
    .values(
      items.map((item) => ({
        ...item,
        slot_bindings: json(item.slot_bindings),
        pipeline_snapshot: json(item.pipeline_snapshot),
        parameters: json(item.parameters),
        input_manifest: json(item.input_manifest),
        error: item.error == null ? null : json(item.error),
      }))
    )
    .returningAll()
    .execute()

export const findPositioningRun = (organizationId: string, id: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('positioning_analysis_runs')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', id)
    .executeTakeFirst()

export const listPositioningItems = (runId: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('positioning_analysis_run_items')
    .selectAll()
    .where('analysis_run_id', '=', runId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()

export const findPositioningRunInOrganization = findPositioningRun

/** #262 will call this claim boundary from its worker before dispatching an item. */
export const claimQueuedPositioningRunItem = (itemId: string, executor: DbExecutor = db) =>
  executor
    .updateTable('positioning_analysis_run_items')
    .set({ status: 'processing', updated_at: new Date() })
    .where('id', '=', itemId)
    .where('status', '=', 'queued')
    .returningAll()
    .executeTakeFirst()

export const findPositioningRunById = (id: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('positioning_analysis_runs')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()

export const updatePositioningRunStatus = (
  runId: string,
  status: 'accepted' | 'processing' | 'completed' | 'partially_completed' | 'failed',
  executor: DbExecutor = db
) =>
  executor
    .updateTable('positioning_analysis_runs')
    .set({ status, updated_at: new Date() })
    .where('id', '=', runId)
    .returningAll()
    .executeTakeFirst()

export const findTimedOutPositioningRunItems = (
  timeoutMinutes: number,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('positioning_analysis_run_items')
    .selectAll()
    .where('status', '=', 'processing')
    .where(
      'updated_at',
      '<',
      sql<Date>`clock_timestamp() - (${timeoutMinutes} * interval '1 minute')`
    )
    .execute()

/** #262 may implement this port with an outbox insert in the same transaction. */
export interface PositioningAnalysisDispatchPort {
  enqueue(runId: string, itemIds: string[], executor: DbExecutor): Promise<void>
}

export const listOrganizationPositioningRuns = async (
  organizationId: string,
  options: PaginationOptions & { filter: 'all' | 'in_progress' | 'failed' },
  executor: DbExecutor = db
) => {
  const summary = executor
    .selectFrom('positioning_analysis_runs as run')
    .leftJoin('positioning_analysis_run_items as item', 'item.analysis_run_id', 'run.id')
    .where('run.organization_id', '=', organizationId)
    .groupBy('run.id')
    .select([
      'run.id',
      'run.status',
      'run.created_at',
      'run.updated_at',
      sql<string>`to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      ),
      sql<number>`count(item.id)::integer`.as('total'),
      sql<number>`count(*) filter (where item.status = 'queued')::integer`.as('queued'),
      sql<number>`count(*) filter (where item.status = 'processing')::integer`.as('processing'),
      sql<number>`count(*) filter (where item.status = 'completed')::integer`.as('completed'),
      sql<number>`count(*) filter (where item.status = 'failed')::integer`.as('failed'),
      sql<number>`count(distinct item.recording_id)::integer`.as('recording_count'),
      sql<
        string[]
      >`coalesce(array_agg(distinct item.pipeline_id order by item.pipeline_id) filter (where item.pipeline_id is not null), ARRAY[]::text[])`.as(
        'pipeline_ids'
      ),
      sql<number>`count(*) filter (where item.output_manifest->'artifacts'->'particle_animation'->>'generation_status' = 'processing')::integer`.as(
        'video_processing'
      ),
      sql<number>`count(*) filter (where item.output_manifest->'artifacts'->'particle_animation'->>'generation_status' = 'failed')::integer`.as(
        'video_failed'
      ),
    ])
    .as('summary')
  const inProgress = sql<boolean>`(queued + processing > 0 or (total = 0 and status in ('accepted', 'processing')))`
  let filtered = executor.selectFrom(summary)
  if (options.filter === 'in_progress') filtered = filtered.where(inProgress)
  if (options.filter === 'failed') filtered = filtered.where('failed', '>', 0)
  let rowsQuery = filtered
    .selectAll()
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit + 1)
  const cursor = options.cursor
  if (cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
    )
  }
  const [rows, count, active] = await Promise.all([
    rowsQuery.execute(),
    filtered.select(sql<number>`count(*)::integer`.as('count')).executeTakeFirstOrThrow(),
    executor
      .selectFrom(summary)
      .where(inProgress)
      .select(sql<number>`count(*)::integer`.as('count'))
      .executeTakeFirstOrThrow(),
  ])
  return { rows, totalCount: count.count, inProgressCount: active.count }
}
