import type { Insertable, Selectable } from 'kysely'
import { sql } from 'kysely'
import type { PaginationOptions } from '../../schemas/pagination.js'
import type { AnalysisRuns, AnalysisRunTrajectories, JsonObject } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type AnalysisRun = Selectable<AnalysisRuns>
export type AnalysisRunTrajectory = Selectable<AnalysisRunTrajectories>
export type AnalysisRunPageRow = AnalysisRun & { cursor_created_at: string }
export type AnalysisRunTrajectoryState = AnalysisRunTrajectory & { deleted: boolean }

export interface ListAnalysisRunsOptions extends PaginationOptions {
  analysisType?: string
  status?: string
  floorId?: string
}

type NewAnalysisRun = Omit<Insertable<AnalysisRuns>, 'parameters'> & {
  parameters: JsonObject
}
type NewAnalysisRunTrajectory = Insertable<AnalysisRunTrajectories>

export const insertAnalysisRun = async (
  run: NewAnalysisRun,
  executor: DbExecutor = db
): Promise<AnalysisRun> => {
  return executor
    .insertInto('analysis_runs')
    .values({ ...run, parameters: JSON.stringify(run.parameters) })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertAnalysisRunTrajectories = async (
  trajectories: NewAnalysisRunTrajectory[],
  executor: DbExecutor = db
): Promise<AnalysisRunTrajectory[]> => {
  if (trajectories.length === 0) return []

  return executor
    .insertInto('analysis_run_trajectories')
    .values(trajectories)
    .returningAll()
    .execute()
}

export const findAnalysisRunById = async (
  analysisRunId: string,
  executor: DbExecutor = db
): Promise<AnalysisRun | undefined> => {
  return executor
    .selectFrom('analysis_runs')
    .selectAll()
    .where('id', '=', analysisRunId)
    .executeTakeFirst()
}

export const findOrganizationAnalysisRunById = async (
  organizationId: string,
  analysisRunId: string,
  executor: DbExecutor = db
): Promise<AnalysisRun | undefined> => {
  return executor
    .selectFrom('analysis_runs')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', analysisRunId)
    .executeTakeFirst()
}

export const listOrganizationAnalysisRuns = async (
  organizationId: string,
  options: ListAnalysisRunsOptions,
  executor: DbExecutor = db
): Promise<{ rows: AnalysisRunPageRow[]; totalCount: number }> => {
  const scope = () => {
    let query = executor.selectFrom('analysis_runs').where('organization_id', '=', organizationId)
    if (options.analysisType) query = query.where('analysis_type', '=', options.analysisType)
    if (options.status) query = query.where('status', '=', options.status)
    if (options.floorId) query = query.where('floor_id', '=', options.floorId)
    return query
  }
  let rowsQuery = scope()
    .selectAll()
    .select(
      sql<string>`to_char(analysis_runs.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      )
    )
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit + 1)
  if (options.cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(analysis_runs.created_at, analysis_runs.id) < (${options.cursor.createdAt}::timestamptz, ${options.cursor.id}::uuid)`
    )
  }
  const [rows, count] = await Promise.all([
    rowsQuery.execute(),
    scope()
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow(),
  ])
  return { rows, totalCount: Number(count.count) }
}

export const listAnalysisRunTrajectories = async (
  analysisRunId: string,
  executor: DbExecutor = db
): Promise<AnalysisRunTrajectory[]> => {
  return executor
    .selectFrom('analysis_run_trajectories')
    .selectAll()
    .where('analysis_run_id', '=', analysisRunId)
    .orderBy('seq', 'asc')
    .execute()
}

export const listAnalysisRunTrajectoryStates = async (
  analysisRunId: string,
  executor: DbExecutor = db
): Promise<AnalysisRunTrajectoryState[]> => {
  const rows = await executor
    .selectFrom('analysis_run_trajectories')
    .innerJoin('trajectories', 'trajectories.id', 'analysis_run_trajectories.trajectory_id')
    .select([
      'analysis_run_trajectories.analysis_run_id',
      'analysis_run_trajectories.trajectory_id',
      'analysis_run_trajectories.seq',
      'trajectories.deleted_at',
    ])
    .where('analysis_run_id', '=', analysisRunId)
    .orderBy('seq', 'asc')
    .execute()

  return rows.map(({ deleted_at, ...row }) => ({ ...row, deleted: deleted_at !== null }))
}

export const markAnalysisRunProcessing = async (
  analysisRunId: string,
  startedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<AnalysisRun | undefined> => {
  return executor
    .updateTable('analysis_runs')
    .set({ status: 'processing', started_at: startedAt, updated_at: startedAt })
    .where('id', '=', analysisRunId)
    .where('status', '=', 'accepted')
    .returningAll()
    .executeTakeFirst()
}

export const markAnalysisRunCompleted = async (
  analysisRunId: string,
  finishedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<AnalysisRun | undefined> => {
  return executor
    .updateTable('analysis_runs')
    .set({ status: 'completed', finished_at: finishedAt, updated_at: finishedAt })
    .where('id', '=', analysisRunId)
    .where('status', '=', 'processing')
    .returningAll()
    .executeTakeFirst()
}

export const markAnalysisRunFailed = async (
  analysisRunId: string,
  errorCode: string,
  finishedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<AnalysisRun | undefined> => {
  return executor
    .updateTable('analysis_runs')
    .set({
      status: 'failed',
      error_code: errorCode,
      finished_at: finishedAt,
      updated_at: finishedAt,
    })
    .where('id', '=', analysisRunId)
    .where('status', 'in', ['accepted', 'processing'])
    .returningAll()
    .executeTakeFirst()
}

export const markTimedOutAnalysisRunsFailed = async (
  now: Date = new Date(),
  executor: DbExecutor = db
): Promise<number> => {
  const runs = await executor
    .updateTable('analysis_runs')
    .set({
      status: 'failed',
      error_code: 'ANALYSIS_TIMEOUT',
      finished_at: now,
      updated_at: now,
    })
    .where('status', 'in', ['accepted', 'processing'])
    .where('deadline_at', '<=', now)
    .returning('id')
    .execute()

  return runs.length
}
