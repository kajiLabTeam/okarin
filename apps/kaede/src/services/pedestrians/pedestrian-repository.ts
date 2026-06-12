import type { Insertable, Selectable } from 'kysely'
import type { Pedestrians } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

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

export const findPedestrianById = async (
  pedestrianId: string,
  executor: DbExecutor = db
): Promise<Pick<Pedestrian, 'id' | 'organization_id'> | undefined> => {
  return executor
    .selectFrom('pedestrians')
    .select(['id', 'organization_id'])
    .where('id', '=', pedestrianId)
    .executeTakeFirst()
}
