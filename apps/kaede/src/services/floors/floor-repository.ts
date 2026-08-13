import type { Insertable, Selectable } from 'kysely'
import type { Floors } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

type Floor = Selectable<Floors>
type NewFloor = Insertable<Floors>

export interface ListFloorsOptions {
  buildingIds?: string[]
  organizationIds?: string[]
}

export interface FloorRow {
  floor_id: string
  building_id: string
  organization_id: string | null
  building_name: string
  level: number
  name: string
  image_object_path: string
  map_width_px: number | null
  map_height_px: number | null
  scale: number | null
  created_at: Date
  updated_at: Date
}

export interface FloorMapDimensionRow {
  id: string
  image_object_path: string
  map_width_px: number | null
  map_height_px: number | null
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
      'floors.image_object_path',
      'floors.map_width_px',
      'floors.map_height_px',
      'floors.scale',
      'floors.created_at',
      'floors.updated_at',
    ])
    .whereRef('buildings.organization_id', '=', 'floors.organization_id')

export const listFloors = async ({ buildingIds, organizationIds }: ListFloorsOptions = {}) => {
  if (buildingIds?.length === 0 || organizationIds?.length === 0) {
    return []
  }

  let query = floorRowsQuery()

  if (buildingIds) {
    query = query.where('floors.building_id', 'in', buildingIds)
  }

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
): Promise<
  Pick<Floor, 'id' | 'organization_id' | 'scale' | 'map_width_px' | 'map_height_px'> | undefined
> => {
  return executor
    .selectFrom('floors')
    .select(['id', 'organization_id', 'scale', 'map_width_px', 'map_height_px'])
    .where('id', '=', floorId)
    .executeTakeFirst()
}

export const listFloorMapDimensionRows = async (
  floorId?: string,
  executor: DbExecutor = db
): Promise<FloorMapDimensionRow[]> => {
  let query = executor
    .selectFrom('floors')
    .select(['id', 'image_object_path', 'map_width_px', 'map_height_px'])
    .orderBy('id', 'asc')
  if (floorId) query = query.where('id', '=', floorId)
  return query.execute()
}

export const backfillFloorMapDimensions = async (
  floorId: string,
  width: number,
  height: number,
  executor: DbExecutor = db
): Promise<boolean> => {
  const updated = await executor
    .updateTable('floors')
    .set({ map_width_px: width, map_height_px: height, updated_at: new Date() })
    .where('id', '=', floorId)
    .where('map_width_px', 'is', null)
    .where('map_height_px', 'is', null)
    .returning('id')
    .executeTakeFirst()
  return updated !== undefined
}
