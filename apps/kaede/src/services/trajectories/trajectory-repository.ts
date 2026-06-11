import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { Trajectories, TrajectoryConstraints } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Trajectory = Selectable<Trajectories>
type NewTrajectory = Insertable<Trajectories>
type TrajectoryUpdate = Updateable<Trajectories>
type NewTrajectoryConstraint = Insertable<TrajectoryConstraints>

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

export const insertTrajectory = async (
  newTrajectory: NewTrajectory,
  executor: DbExecutor = db
): Promise<Trajectory> => {
  return executor
    .insertInto('trajectories')
    .values(newTrajectory)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertTrajectoryConstraints = async (
  constraints: NewTrajectoryConstraint[],
  executor: DbExecutor = db
): Promise<void> => {
  if (constraints.length === 0) {
    return
  }

  await executor.insertInto('trajectory_constraints').values(constraints).execute()
}

export const insertTrajectoryWithConstraints = async (
  trajectory: NewTrajectory,
  constraints: Omit<NewTrajectoryConstraint, 'trajectory_id'>[]
): Promise<Trajectory> => {
  return db.transaction().execute(async (trx) => {
    const insertedTrajectory = await insertTrajectory(trajectory, trx)

    await insertTrajectoryConstraints(
      constraints.map((constraint) => ({
        ...constraint,
        trajectory_id: insertedTrajectory.id,
      })),
      trx
    )

    return insertedTrajectory
  })
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
