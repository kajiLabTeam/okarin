import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { TrajectoryConstraints } from '../../schemas/trajectories.js'
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

const activeTrajectoriesQuery = (executor: DbExecutor) =>
  executor.selectFrom('trajectories').where('deleted_at', 'is', null)

export const findTrajectoryById = async (
  trajectoryId: string,
  executor: DbExecutor = db
): Promise<Trajectory | undefined> => {
  return activeTrajectoriesQuery(executor)
    .selectAll()
    .where('id', '=', trajectoryId)
    .executeTakeFirst()
}

export const listTrajectoriesByRecordingId = async (
  recordingId: string,
  executor: DbExecutor = db
): Promise<Trajectory[]> => {
  return activeTrajectoriesQuery(executor)
    .selectAll()
    .where('recording_id', '=', recordingId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
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
