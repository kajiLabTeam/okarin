import type { Insertable, Selectable } from 'kysely'
import type { Floors } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

type Floor = Selectable<Floors>
type NewFloor = Insertable<Floors>

export interface ListFloorsOptions {
  organizationIds?: string[]
}

export interface FloorRow {
  floor_id: string
  building_id: string
  organization_id: string | null
  building_name: string
  level: number
  name: string
  scale: number | null
  created_at: Date
  updated_at: Date
}

const floorRowsQuery = () =>
  db
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

export const listFloors = async ({ organizationIds }: ListFloorsOptions = {}) => {
  if (organizationIds?.length === 0) {
    return []
  }

  let query = floorRowsQuery()

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

export const findFloorDetailById = async (
  floorId: string,
  { organizationIds }: ListFloorsOptions = {}
): Promise<FloorRow | undefined> => {
  if (organizationIds?.length === 0) {
    return undefined
  }

  let query = floorRowsQuery().where('floors.id', '=', floorId)

  if (organizationIds) {
    query = query.where('floors.organization_id', 'in', organizationIds)
  }

  return query.executeTakeFirst()
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
