import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import type { Pedestrians } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Pedestrian = Selectable<Pedestrians>
type NewPedestrian = Insertable<Pedestrians>

export const listPedestrians = async (executor: DbExecutor = db): Promise<Pedestrian[]> => {
  return executor
    .selectFrom('pedestrians')
    .selectAll()
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute()
}

export const insertPedestrian = async (
  newPedestrian: NewPedestrian,
  executor: DbExecutor = db
): Promise<Pedestrian> => {
  return executor
    .insertInto('pedestrians')
    .values(newPedestrian)
    .returningAll()
    .executeTakeFirstOrThrow()
}
