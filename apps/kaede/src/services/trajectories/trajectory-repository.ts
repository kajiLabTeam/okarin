import { sql } from 'kysely'
import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { PaginationOptions } from '../../schemas/pagination.js'
import type {
  TrajectoryConstraints,
  TrajectoryExecutionMetadata,
} from '../../schemas/trajectories.js'
import type { Trajectories } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
export type Trajectory = Selectable<Trajectories>
type NewTrajectory = Insertable<Trajectories>
type NewTrajectoryInput = Omit<NewTrajectory, 'constraints'> & {
  constraints?: TrajectoryConstraints
}
type TrajectoryUpdate = Updateable<Trajectories>

export interface TrajectoryWithExecution extends Trajectory {
  execution: TrajectoryExecutionMetadata | null
}

export type TrajectoryPageRow = TrajectoryWithExecution & {
  cursor_created_at: string
}

export interface TrajectoryPageRows {
  rows: TrajectoryPageRow[]
  totalCount: number
}

const activeTrajectoriesQuery = (executor: DbExecutor) =>
  executor.selectFrom('trajectories').where('deleted_at', 'is', null)

const activeTrajectoriesWithExecutionQuery = (executor: DbExecutor) =>
  executor
    .selectFrom('trajectories')
    .leftJoin(
      'positioning_analysis_run_items as item',
      'item.result_trajectory_id',
      'trajectories.id'
    )
    .where('trajectories.deleted_at', 'is', null)
    .select([
      'trajectories.id',
      'trajectories.organization_id',
      'trajectories.recording_id',
      'trajectories.floor_id',
      'trajectories.status',
      'trajectories.constraints',
      'trajectories.error_code',
      'trajectories.error_message',
      'trajectories.failed_at',
      'trajectories.created_at',
      'trajectories.updated_at',
      'trajectories.deleted_at',
      'item.analysis_run_id as item_analysis_run_id',
      'item.id as item_id',
      'item.pipeline_id as item_pipeline_id',
      'item.pipeline_version as item_pipeline_version',
      'item.pipeline_digest as item_pipeline_digest',
      'item.parameters as item_parameters',
      'item.input_manifest as item_input_manifest',
      'item.created_at as item_created_at',
    ])

export const buildTrajectoryExecutionMetadata = (row: {
  created_at: Date
  item_analysis_run_id: string | null
  item_id: string | null
  item_pipeline_id: string | null
  item_pipeline_version: string | null
  item_pipeline_digest: string | null
  item_parameters: unknown
  item_input_manifest: unknown
  item_created_at: Date | null
}): TrajectoryExecutionMetadata => {
  if (row.item_id && row.item_pipeline_id) {
    const rawParameters =
      typeof row.item_parameters === 'string'
        ? (JSON.parse(row.item_parameters) as Record<string, unknown>)
        : ((row.item_parameters ?? {}) as Record<string, unknown>)
    const rawInputs =
      typeof row.item_input_manifest === 'string'
        ? (JSON.parse(row.item_input_manifest) as Record<string, unknown>)
        : ((row.item_input_manifest ?? null) as Record<string, unknown> | null)

    return {
      analysis_run_id: row.item_analysis_run_id,
      analysis_run_item_id: row.item_id,
      pipeline_id: row.item_pipeline_id,
      pipeline_version: row.item_pipeline_version,
      pipeline_digest: row.item_pipeline_digest,
      parameters: rawParameters,
      inputs: rawInputs,
      executed_at: (row.item_created_at ?? row.created_at).toISOString(),
    }
  }

  return {
    analysis_run_id: null,
    analysis_run_item_id: null,
    pipeline_id: 'legacy-pdr',
    pipeline_version: null,
    pipeline_digest: null,
    parameters: {},
    inputs: null,
    executed_at: row.created_at.toISOString(),
  }
}

const mapRowToTrajectoryWithExecution = (row: {
  id: string
  organization_id: string
  recording_id: string
  floor_id: string
  status: string
  constraints: unknown
  error_code: string | null
  error_message: string | null
  failed_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  item_analysis_run_id: string | null
  item_id: string | null
  item_pipeline_id: string | null
  item_pipeline_version: string | null
  item_pipeline_digest: string | null
  item_parameters: unknown
  item_input_manifest: unknown
  item_created_at: Date | null
}): TrajectoryWithExecution => ({
  id: row.id,
  organization_id: row.organization_id,
  recording_id: row.recording_id,
  floor_id: row.floor_id,
  status: row.status,
  constraints: row.constraints as Trajectory['constraints'],
  error_code: row.error_code,
  error_message: row.error_message,
  failed_at: row.failed_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at,
  execution: buildTrajectoryExecutionMetadata(row),
})

export const findTrajectoryById = async (
  trajectoryId: string,
  executor: DbExecutor = db
): Promise<TrajectoryWithExecution | undefined> => {
  const row = await activeTrajectoriesWithExecutionQuery(executor)
    .where('trajectories.id', '=', trajectoryId)
    .executeTakeFirst()

  if (!row) return undefined
  return mapRowToTrajectoryWithExecution(row)
}

export const listTrajectoriesByRecordingIdPaginated = async (
  recordingId: string,
  options: PaginationOptions,
  executor: DbExecutor = db
): Promise<TrajectoryPageRows> => {
  let rowsQuery = activeTrajectoriesWithExecutionQuery(executor)
    .select(
      sql<string>`to_char(trajectories.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      )
    )
    .where('trajectories.recording_id', '=', recordingId)
    .orderBy('trajectories.created_at', 'desc')
    .orderBy('trajectories.id', 'desc')
    .limit(options.limit + 1)

  if (options.cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(trajectories.created_at, trajectories.id) < (${options.cursor.createdAt}::timestamptz, ${options.cursor.id}::uuid)`
    )
  }

  const [rawRows, countRow] = await Promise.all([
    rowsQuery.execute(),
    activeTrajectoriesQuery(executor)
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('recording_id', '=', recordingId)
      .executeTakeFirstOrThrow(),
  ])

  return {
    rows: rawRows.map((row) => ({
      ...mapRowToTrajectoryWithExecution(row),
      cursor_created_at: row.cursor_created_at,
    })),
    totalCount: Number(countRow.count),
  }
}

export const listTrajectoriesByOrganizationIdPaginated = async (
  organizationId: string,
  options: PaginationOptions,
  executor: DbExecutor = db
): Promise<TrajectoryPageRows> => {
  let rowsQuery = activeTrajectoriesWithExecutionQuery(executor)
    .select(
      sql<string>`to_char(trajectories.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      )
    )
    .where('trajectories.organization_id', '=', organizationId)
    .orderBy('trajectories.created_at', 'desc')
    .orderBy('trajectories.id', 'desc')
    .limit(options.limit + 1)

  if (options.cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(trajectories.created_at, trajectories.id) < (${options.cursor.createdAt}::timestamptz, ${options.cursor.id}::uuid)`
    )
  }

  const [rawRows, countRow] = await Promise.all([
    rowsQuery.execute(),
    activeTrajectoriesQuery(executor)
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('organization_id', '=', organizationId)
      .executeTakeFirstOrThrow(),
  ])

  return {
    rows: rawRows.map((row) => ({
      ...mapRowToTrajectoryWithExecution(row),
      cursor_created_at: row.cursor_created_at,
    })),
    totalCount: Number(countRow.count),
  }
}

export const insertTrajectory = async (
  newTrajectory: NewTrajectoryInput,
  executor: DbExecutor = db
): Promise<Trajectory> => {
  const values: NewTrajectory =
    newTrajectory.constraints === undefined
      ? newTrajectory
      : { ...newTrajectory, constraints: JSON.stringify(newTrajectory.constraints) }

  return executor.insertInto('trajectories').values(values).returningAll().executeTakeFirstOrThrow()
}

export const updateTrajectory = async (
  trajectoryId: string,
  patch: TrajectoryUpdate,
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return executor
    .updateTable('trajectories')
    .set(patch)
    .where('id', '=', trajectoryId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst()
}

export const softDeleteTrajectory = async (
  trajectoryId: string,
  deletedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return executor
    .updateTable('trajectories')
    .set({ deleted_at: deletedAt })
    .where('id', '=', trajectoryId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst()
}

export const markTrajectoryProcessing = async (
  trajectoryId: string,
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return executor
    .updateTable('trajectories')
    .set({
      status: 'processing',
      error_code: null,
      error_message: null,
      failed_at: null,
    })
    .where('id', '=', trajectoryId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'accepted')
    .returningAll()
    .executeTakeFirst()
}

export const markTrajectoryCompleted = async (
  trajectoryId: string,
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return executor
    .updateTable('trajectories')
    .set({
      status: 'completed',
      error_code: null,
      error_message: null,
      failed_at: null,
    })
    .where('id', '=', trajectoryId)
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['accepted', 'processing'])
    .returningAll()
    .executeTakeFirst()
}

export const markTrajectoryFailed = async (
  trajectoryId: string,
  errorCode: string,
  errorMessage: string,
  failedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return executor
    .updateTable('trajectories')
    .set({
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      failed_at: failedAt,
    })
    .where('id', '=', trajectoryId)
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['accepted', 'processing'])
    .returningAll()
    .executeTakeFirst()
}
