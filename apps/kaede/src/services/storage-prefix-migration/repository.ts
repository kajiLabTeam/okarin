import { db } from '../db/index.js'

export interface FloorMapMigrationRow {
  resourceType: 'floor_map'
  resourceId: string
  organizationId: string
  buildingId: string
  sourceKey: string
  currentKey: string
}

export interface TrajectoryResultMigrationRow {
  resourceType: 'trajectory_result'
  resourceId: string
  organizationId: string
  status: string
  deletedAt: Date | null
  sourceKey: string
}

export type MigrationRow = FloorMapMigrationRow | TrajectoryResultMigrationRow

export interface MigrationFilters {
  resourceId?: string
  organizationId?: string
  limit: number
}

export const listFloorMapMigrationRows = async (
  filters: MigrationFilters
): Promise<FloorMapMigrationRow[]> => {
  let query = db
    .selectFrom('floors')
    .innerJoin('buildings', 'buildings.id', 'floors.building_id')
    .select([
      'floors.id as resourceId',
      'buildings.organization_id as organizationId',
      'buildings.id as buildingId',
      'floors.image_object_path as currentKey',
    ])
    .orderBy('floors.id')
    .limit(filters.limit)

  if (filters.resourceId) query = query.where('floors.id', '=', filters.resourceId)
  if (filters.organizationId) {
    query = query.where('buildings.organization_id', '=', filters.organizationId)
  }

  return (await query.execute()).map((row) => {
    const extension = row.currentKey.endsWith('.svg') ? 'svg' : 'png'
    return {
      ...row,
      resourceType: 'floor_map' as const,
      sourceKey: `maps/${row.buildingId}/${row.resourceId}.${extension}`,
    }
  })
}

export const listTrajectoryResultMigrationRows = async (
  filters: MigrationFilters
): Promise<TrajectoryResultMigrationRow[]> => {
  let query = db
    .selectFrom('trajectories')
    .select([
      'id as resourceId',
      'organization_id as organizationId',
      'status',
      'deleted_at as deletedAt',
    ])
    .where('status', 'in', ['completed', 'failed'])
    .orderBy('id')
    .limit(filters.limit)

  if (filters.resourceId) query = query.where('id', '=', filters.resourceId)
  if (filters.organizationId) query = query.where('organization_id', '=', filters.organizationId)

  return (await query.execute()).map((row) => ({
    ...row,
    resourceType: 'trajectory_result' as const,
    sourceKey: `trajectories/${row.resourceId}/analyzed/result.csv`,
  }))
}

export const countInFlightTrajectories = async () => {
  const row = await db
    .selectFrom('trajectories')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('status', 'in', ['accepted', 'processing'])
    .executeTakeFirstOrThrow()
  return Number(row.count)
}

export const switchFloorMapPath = async (
  floorId: string,
  sourceKey: string,
  destinationKey: string
) => {
  const result = await db
    .updateTable('floors')
    .set({ image_object_path: destinationKey })
    .where('id', '=', floorId)
    .where('image_object_path', '=', sourceKey)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) === 1
}
