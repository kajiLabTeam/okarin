import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { Recordings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Recording = Selectable<Recordings>
type NewRecording = Insertable<Recordings>
type RecordingUpdate = Updateable<Recordings>
export type { Recording }

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

export const listRecordingsByOrganizationId = async (
  organizationId: string,
  executor: DbExecutor = db
): Promise<Recording[]> => {
  return activeRecordingsQuery(executor)
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('created_at', 'desc')
    .execute()
}

export const listRecordingsByPedestrianId = async (
  pedestrianId: string,
  executor: DbExecutor = db
): Promise<Recording[]> => {
  return activeRecordingsQuery(executor)
    .selectAll()
    .where('pedestrian_id', '=', pedestrianId)
    .orderBy('created_at', 'desc')
    .execute()
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
  newRecording: NewRecording,
  executor: DbExecutor = db
): Promise<Recording> => {
  return executor
    .insertInto('recordings')
    .values(newRecording)
    .returningAll()
    .executeTakeFirstOrThrow()
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
