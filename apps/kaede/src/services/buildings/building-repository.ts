import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import type { Buildings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>
type Building = Selectable<Buildings>
type NewBuilding = Insertable<Buildings>

export interface ListBuildingsOptions {
  organizationIds?: string[]
}

export const listBuildings = async ({ organizationIds }: ListBuildingsOptions = {}): Promise<
  Building[]
> => {
  if (organizationIds?.length === 0) {
    return []
  }

  let query = db.selectFrom('buildings').selectAll()

  if (organizationIds) {
    query = query.where('organization_id', 'in', organizationIds)
  }

  return query.orderBy('name', 'asc').orderBy('id', 'asc').execute()
}

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

export const findBuildingDetailById = async (
  buildingId: string,
  { organizationIds }: ListBuildingsOptions = {}
): Promise<Building | undefined> => {
  if (organizationIds?.length === 0) {
    return undefined
  }

  let query = db.selectFrom('buildings').selectAll().where('id', '=', buildingId)

  if (organizationIds) {
    query = query.where('organization_id', 'in', organizationIds)
  }

  return query.executeTakeFirst()
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
