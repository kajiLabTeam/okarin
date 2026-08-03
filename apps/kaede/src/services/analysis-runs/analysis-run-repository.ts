import type { Insertable, Selectable } from 'kysely'
import type { AnalysisRuns, AnalysisRunTrajectories, JsonObject } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type AnalysisRun = Selectable<AnalysisRuns>
export type AnalysisRunTrajectory = Selectable<AnalysisRunTrajectories>

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
