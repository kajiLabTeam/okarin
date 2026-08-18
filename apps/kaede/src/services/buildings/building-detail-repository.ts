import type { Selectable } from 'kysely'
import type { Buildings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'
import { listFloors } from '../floors/floor-repository.js'
import type { FloorRow } from '../floors/floor-repository.js'

type Building = Selectable<Buildings>

export type BuildingDetailFloorRow = FloorRow & { recording_count: number }
export interface BuildingSummaryRow {
  building: Building
  floor_count: number
  recording_count: number
}
export interface BuildingDetailRow {
  building: Building
  floors: BuildingDetailFloorRow[]
}

const listCountsByBuilding = async (
  organizationId: string,
  buildingIds: string[],
  executor: DbExecutor
): Promise<Map<string, { floor_count: number; recording_count: number }>> => {
  if (buildingIds.length === 0) {
    return new Map()
  }

  const [floorRows, recordingRows] = await Promise.all([
    executor
      .selectFrom('floors')
      .select('building_id')
      .select(({ fn }) => fn.countAll<string>().as('floor_count'))
      .where('organization_id', '=', organizationId)
      .where('building_id', 'in', buildingIds)
      .groupBy('building_id')
      .execute(),
    executor
      .selectFrom('recordings')
      .innerJoin('floors', 'floors.id', 'recordings.floor_id')
      .select('floors.building_id')
      .select(({ fn }) => fn.countAll<string>().as('recording_count'))
      .where('recordings.organization_id', '=', organizationId)
      .where('floors.organization_id', '=', organizationId)
      .where('floors.building_id', 'in', buildingIds)
      .where('recordings.deleted_at', 'is', null)
      .groupBy('floors.building_id')
      .execute(),
  ])

  const counts = new Map<string, { floor_count: number; recording_count: number }>()

  for (const row of floorRows) {
    counts.set(row.building_id, {
      floor_count: Number(row.floor_count),
      recording_count: 0,
    })
  }

  for (const row of recordingRows) {
    const current = counts.get(row.building_id) ?? { floor_count: 0, recording_count: 0 }
    current.recording_count = Number(row.recording_count)
    counts.set(row.building_id, current)
  }

  return counts
}

export const listBuildingSummariesForOrganization = async (
  organizationId: string,
  executor: DbExecutor = db
): Promise<BuildingSummaryRow[]> => {
  const buildings = await executor
    .selectFrom('buildings')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const counts = await listCountsByBuilding(
    organizationId,
    buildings.map((building) => building.id),
    executor
  )

  return buildings.map((building) => ({
    building,
    floor_count: counts.get(building.id)?.floor_count ?? 0,
    recording_count: counts.get(building.id)?.recording_count ?? 0,
  }))
}

const findBuildingForOrganization = async (
  organizationId: string,
  buildingId: string,
  executor: DbExecutor
) => {
  return executor
    .selectFrom('buildings')
    .selectAll()
    .where('id', '=', buildingId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst()
}

const listRecordingCountsByFloor = async (
  organizationId: string,
  floorIds: string[],
  executor: DbExecutor
) => {
  if (floorIds.length === 0) {
    return new Map<string, number>()
  }

  const rows = await executor
    .selectFrom('recordings')
    .select('floor_id')
    .select(({ fn }) => fn.countAll<string>().as('recording_count'))
    .where('organization_id', '=', organizationId)
    .where('floor_id', 'in', floorIds)
    .where('deleted_at', 'is', null)
    .groupBy('floor_id')
    .execute()

  return new Map(rows.map((row) => [row.floor_id, Number(row.recording_count)]))
}

export const findBuildingDetailForOrganization = async (
  organizationId: string,
  buildingId: string,
  executor: DbExecutor = db
): Promise<BuildingDetailRow | undefined> => {
  const building = await findBuildingForOrganization(organizationId, buildingId, executor)

  if (!building) {
    return undefined
  }

  const floors = await listFloors({
    buildingIds: [buildingId],
    organizationIds: [organizationId],
    executor,
  })
  const recordingCounts = await listRecordingCountsByFloor(
    organizationId,
    floors.map((floor) => floor.floor_id),
    executor
  )

  return {
    building,
    floors: floors.map((floor) => ({
      ...floor,
      recording_count: recordingCounts.get(floor.floor_id) ?? 0,
    })),
  }
}
