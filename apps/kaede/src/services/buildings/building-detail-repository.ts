import type { Selectable } from 'kysely'
import type { Buildings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'
import { listFloors } from '../floors/floor-repository.js'
import type { FloorRow } from '../floors/floor-repository.js'

type Building = Selectable<Buildings>

export type BuildingDetailFloorRow = FloorRow & { recording_count: number }
export interface BuildingDetailRow {
  building: Building
  floors: BuildingDetailFloorRow[]
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
