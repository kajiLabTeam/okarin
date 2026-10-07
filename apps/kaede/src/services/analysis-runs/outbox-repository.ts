import { sql } from 'kysely'
import type { Insertable, Selectable } from 'kysely'
import type { Json, OutboxJobs } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type OutboxJob = Selectable<OutboxJobs>
export type NewOutboxJob = Omit<Insertable<OutboxJobs>, 'id' | 'created_at' | 'updated_at'>

const json = (value: unknown): Json => JSON.stringify(value) as Json

export interface PositioningAnalysisDispatchPayload {
  analysis_run_item_id: string
}

export const insertOutboxJobs = async (
  jobs: (Omit<NewOutboxJob, 'payload'> & { payload: unknown })[],
  executor: DbExecutor = db
): Promise<OutboxJob[]> => {
  if (jobs.length === 0) {
    return []
  }

  return executor
    .insertInto('outbox_jobs')
    .values(
      jobs.map((job) => ({
        ...job,
        payload: json(job.payload),
      }))
    )
    .returningAll()
    .execute()
}

export interface ClaimJobsParams {
  limit: number
  leaseDurationMs: number
  leaseToken: string
}

export const claimPendingOutboxJobs = async (
  params: ClaimJobsParams,
  executor: DbExecutor = db
): Promise<OutboxJob[]> => {
  const result = await sql<OutboxJob>`
    WITH ready_jobs AS (
      SELECT id FROM outbox_jobs
      WHERE (
        status = 'pending' AND run_at <= clock_timestamp()
      ) OR (
        status = 'processing' AND leased_until IS NOT NULL AND leased_until < clock_timestamp()
      )
      ORDER BY run_at ASC
      LIMIT ${params.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_jobs
    SET
      status = 'processing',
      lease_token = ${params.leaseToken},
      leased_until = clock_timestamp() + (${params.leaseDurationMs} * interval '1 millisecond'),
      attempts = attempts + 1,
      updated_at = clock_timestamp()
    FROM ready_jobs
    WHERE outbox_jobs.id = ready_jobs.id
    RETURNING outbox_jobs.*
  `.execute(executor)

  return result.rows
}

export const completeOutboxJob = async (id: string, executor: DbExecutor = db): Promise<void> => {
  await executor
    .updateTable('outbox_jobs')
    .set({
      status: 'completed',
      lease_token: null,
      leased_until: null,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute()
}

export const failOutboxJob = async (
  id: string,
  error: string,
  retryAt?: Date | null,
  executor: DbExecutor = db
): Promise<void> => {
  if (retryAt) {
    await executor
      .updateTable('outbox_jobs')
      .set({
        status: 'pending',
        lease_token: null,
        leased_until: null,
        run_at: retryAt,
        last_error: error,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute()
  } else {
    await executor
      .updateTable('outbox_jobs')
      .set({
        status: 'failed',
        lease_token: null,
        leased_until: null,
        last_error: error,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute()
  }
}

export const findOutboxJobById = async (
  id: string,
  executor: DbExecutor = db
): Promise<OutboxJob | undefined> => {
  return executor.selectFrom('outbox_jobs').selectAll().where('id', '=', id).executeTakeFirst()
}
