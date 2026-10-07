import type { Insertable, Selectable } from 'kysely'
import type { Json, PositioningAnalysisCallbacks } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type PositioningCallbackRecord = Selectable<PositioningAnalysisCallbacks>
type NewCallbackRecord = Omit<Insertable<PositioningAnalysisCallbacks>, 'id'>

const json = (value: unknown) => JSON.stringify(value) as Json

export const findPositioningCallbackByEventId = (eventId: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('positioning_analysis_callbacks')
    .selectAll()
    .where('event_id', '=', eventId)
    .executeTakeFirst()

export const insertPositioningCallback = (
  record: Omit<NewCallbackRecord, 'payload'> & { payload: unknown },
  executor: DbExecutor = db
) =>
  executor
    .insertInto('positioning_analysis_callbacks')
    .values({
      ...record,
      payload: json(record.payload),
    })
    .onConflict((oc) => oc.column('event_id').doNothing())
    .returningAll()
    .executeTakeFirst()

export const findPositioningRunItemById = (itemId: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('positioning_analysis_run_items')
    .selectAll()
    .where('id', '=', itemId)
    .executeTakeFirst()

export const updatePositioningRunItemState = (
  itemId: string,
  updates: {
    status: 'queued' | 'processing' | 'completed' | 'failed'
    result_trajectory_id?: string | null
    error?: unknown
  },
  executor: DbExecutor = db
) =>
  executor
    .updateTable('positioning_analysis_run_items')
    .set({
      status: updates.status,
      result_trajectory_id: updates.result_trajectory_id ?? null,
      error: updates.error == null ? null : json(updates.error),
      updated_at: new Date(),
    })
    .where('id', '=', itemId)
    .returningAll()
    .executeTakeFirst()
