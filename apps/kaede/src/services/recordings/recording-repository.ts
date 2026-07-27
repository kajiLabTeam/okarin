import { sql } from 'kysely'
import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { PaginationOptions } from '../../schemas/pagination.js'
import type { TrajectoryConstraints } from '../../schemas/trajectories.js'
import type { Recordings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Recording = Selectable<Recordings>
type NewRecording = Insertable<Recordings>
type NewRecordingInput = Omit<NewRecording, 'constraints'> & {
  constraints?: TrajectoryConstraints
}
type RecordingUpdate = Updateable<Recordings>
export type { Recording }

export type RecordingPageRow = Recording & {
  cursor_created_at: string
}

export interface RecordingPageRows {
  rows: RecordingPageRow[]
  totalCount: number
}

export interface RecordingAuthorizationRow {
  id: string
  organization_id: string
  pedestrian_id: string
  pedestrian_user_id: string | null
}

const activeRecordingsQuery = (executor: DbExecutor) =>
  executor.selectFrom('recordings').where('deleted_at', 'is', null)

export const findRecordingById = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return activeRecordingsQuery(executor)
    .selectAll()
    .where('id', '=', recordingId)
    .executeTakeFirst()
}

export const listRecordingsByOrganizationIdPaginated = async (
  organizationId: string,
  options: PaginationOptions,
  executor: DbExecutor = db
): Promise<RecordingPageRows> => {
  let rowsQuery = activeRecordingsQuery(executor)
    .selectAll()
    .select(
      sql<string>`to_char(recordings.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      )
    )
    .where('organization_id', '=', organizationId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit + 1)

  if (options.cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(recordings.created_at, recordings.id) < (${options.cursor.createdAt}::timestamptz, ${options.cursor.id}::uuid)`
    )
  }

  const [rows, countRow] = await Promise.all([
    rowsQuery.execute(),
    activeRecordingsQuery(executor)
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('organization_id', '=', organizationId)
      .executeTakeFirstOrThrow(),
  ])

  return {
    rows,
    totalCount: Number(countRow.count),
  }
}

export const listRecordingsByPedestrianIdPaginated = async (
  pedestrianId: string,
  options: PaginationOptions,
  executor: DbExecutor = db
): Promise<RecordingPageRows> => {
  let rowsQuery = activeRecordingsQuery(executor)
    .selectAll()
    .select(
      sql<string>`to_char(recordings.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at'
      )
    )
    .where('pedestrian_id', '=', pedestrianId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit + 1)

  if (options.cursor) {
    rowsQuery = rowsQuery.where(
      sql<boolean>`(recordings.created_at, recordings.id) < (${options.cursor.createdAt}::timestamptz, ${options.cursor.id}::uuid)`
    )
  }

  const [rows, countRow] = await Promise.all([
    rowsQuery.execute(),
    activeRecordingsQuery(executor)
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('pedestrian_id', '=', pedestrianId)
      .executeTakeFirstOrThrow(),
  ])

  return {
    rows,
    totalCount: Number(countRow.count),
  }
}

export const findRecordingAuthorizationById = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<RecordingAuthorizationRow | undefined> => {
  return activeRecordingsQuery(executor)
    .innerJoin('pedestrians', 'pedestrians.id', 'recordings.pedestrian_id')
    .select([
      'recordings.id as id',
      'recordings.organization_id as organization_id',
      'recordings.pedestrian_id as pedestrian_id',
      'pedestrians.user_id as pedestrian_user_id',
    ])
    .where('recordings.id', '=', recordingId)
    .executeTakeFirst()
}

export const insertRecording = async (
  newRecording: NewRecordingInput,
  executor: DbExecutor = db
): Promise<Recording> => {
  const values: NewRecording =
    newRecording.constraints === undefined
      ? newRecording
      : { ...newRecording, constraints: JSON.stringify(newRecording.constraints) }

  return executor.insertInto('recordings').values(values).returningAll().executeTakeFirstOrThrow()
}

export const updateRecording = async (
  recordingId: string,
  patch: RecordingUpdate,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return executor
    .updateTable('recordings')
    .set(patch)
    .where('id', '=', recordingId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst()
}

export const updateRecordingConstraints = async (
  recordingId: string,
  constraints: TrajectoryConstraints,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return updateRecording(recordingId, { constraints: JSON.stringify(constraints) }, executor)
}

export const markRecordingUploadReady = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return executor
    .updateTable('recordings')
    .set({ upload_status: 'ready' })
    .where('id', '=', recordingId)
    .where('deleted_at', 'is', null)
    .where('upload_status', '=', 'accepted')
    .returningAll()
    .executeTakeFirst()
}

export const markRecordingUploadFailed = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return updateRecording(recordingId, { upload_status: 'failed' }, executor)
}
