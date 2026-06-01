import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import type { Buildings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Building = Selectable<Buildings>
type NewBuilding = Insertable<Buildings>

export const findBuildingById = async (
  buildingId: string,
  executor: DbExecutor = db
): Promise<Building | undefined> => {
  return executor
    .selectFrom('buildings')
    .selectAll()
    .where('id', '=', buildingId)
    .executeTakeFirst()
}

export const insertBuilding = async (
  newBuilding: NewBuilding,
  executor: DbExecutor = db
): Promise<Building> => {
  return executor
    .insertInto('buildings')
    .values(newBuilding)
    .returningAll()
    .executeTakeFirstOrThrow()
}
