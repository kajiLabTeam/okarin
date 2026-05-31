import { db } from '../db/index.js'

export const listFloors = async () => {
  return db
    .selectFrom('floors')
    .innerJoin('buildings', 'buildings.id', 'floors.building_id')
    .select([
      'floors.id as floor_id',
      'floors.building_id',
      'buildings.name as building_name',
      'floors.level',
      'floors.name',
      'floors.scale',
      'floors.created_at',
      'floors.updated_at',
    ])
    .orderBy('buildings.name', 'asc')
    .orderBy('floors.level', 'asc')
    .orderBy('floors.name', 'asc')
    .orderBy('floors.id', 'asc')
    .execute()
}
