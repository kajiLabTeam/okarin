import type { Insertable, Selectable } from 'kysely'
import type { Pedestrians } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

type Pedestrian = Selectable<Pedestrians>
type NewPedestrian = Insertable<Pedestrians>
export type { Pedestrian }

export interface ListPedestriansOptions {
  organizationIds?: string[]
}

export const listPedestrians = async (
  { organizationIds }: ListPedestriansOptions = {},
  executor: DbExecutor = db
): Promise<Pedestrian[]> => {
  if (organizationIds?.length === 0) {
    return []
  }

  let query = executor.selectFrom('pedestrians').selectAll()

  if (organizationIds) {
    query = query.where('organization_id', 'in', organizationIds)
  }

  return query.orderBy('created_at', 'asc').orderBy('id', 'asc').execute()
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
): Promise<Pick<Pedestrian, 'id' | 'organization_id' | 'user_id'> | undefined> => {
  return executor
    .selectFrom('pedestrians')
    .select(['id', 'organization_id', 'user_id'])
    .where('id', '=', pedestrianId)
    .executeTakeFirst()
}

export const findPedestrianByUserId = async (
  userId: string,
  executor: DbExecutor = db
): Promise<Pedestrian | undefined> => {
  return executor
    .selectFrom('pedestrians')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst()
}
