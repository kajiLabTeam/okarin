import type { Insertable, Selectable } from 'kysely'
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

/** #262 may implement this port with an outbox insert in the same transaction. */
export interface PositioningAnalysisDispatchPort {
  enqueue(runId: string, itemIds: string[], executor: DbExecutor): Promise<void>
}
