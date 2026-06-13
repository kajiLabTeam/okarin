import type { Insertable, Selectable } from 'kysely'
import type { Floors } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

type Floor = Selectable<Floors>
type NewFloor = Insertable<Floors>

export interface ListFloorsOptions {
  organizationIds?: string[]
}

export const listFloors = async ({ organizationIds }: ListFloorsOptions = {}) => {
  if (organizationIds?.length === 0) {
    return []
  }

  let query = db
    .selectFrom('floors')
    .innerJoin('buildings', 'buildings.id', 'floors.building_id')
    .select([
      'floors.id as floor_id',
      'floors.building_id',
      'floors.organization_id',
      'buildings.name as building_name',
      'floors.level',
      'floors.name',
      'floors.scale',
      'floors.created_at',
      'floors.updated_at',
    ])

  if (organizationIds) {
    query = query.where('floors.organization_id', 'in', organizationIds)
  }

  return query
    .orderBy('buildings.name', 'asc')
    .orderBy('floors.level', 'asc')
    .orderBy('floors.name', 'asc')
    .orderBy('floors.id', 'asc')
    .execute()
}

export const insertFloor = async (
  newFloor: NewFloor,
  executor: DbExecutor = db
): Promise<Floor> => {
  return executor.insertInto('floors').values(newFloor).returningAll().executeTakeFirstOrThrow()
}

export const findFloorById = async (
  floorId: string,
  executor: DbExecutor = db
): Promise<Pick<Floor, 'id' | 'organization_id'> | undefined> => {
  return executor
    .selectFrom('floors')
    .select(['id', 'organization_id'])
    .where('id', '=', floorId)
    .executeTakeFirst()
}
