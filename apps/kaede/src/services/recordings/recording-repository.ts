import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { Recordings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Recording = Selectable<Recordings>
type NewRecording = Insertable<Recordings>
type RecordingUpdate = Updateable<Recordings>

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
  return updateRecording(recordingId, { upload_status: 'ready' }, executor)
}

export const markRecordingUploadFailed = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<Recording | undefined> => {
  return updateRecording(recordingId, { upload_status: 'failed' }, executor)
}
