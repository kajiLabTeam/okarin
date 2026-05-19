import type { Kysely } from 'kysely'
import type { DB } from '../../src/services/db/generated.js'
import { insertRecording } from '../../src/services/recordings/index.js'
import type { RecordingStatus, UploadTarget } from '../../src/services/recordings/types.js'

export interface CreateRecordingFixtureParams {
  uploadStatus?: RecordingStatus
  uploadTargets?: UploadTarget[]
  buildingName?: string
  floorLevel?: number
  floorName?: string
}

export const createRecordingFixture = async (
  db: Kysely<DB>,
  params: CreateRecordingFixtureParams = {}
) => {
  const {
    uploadStatus = 'accepted',
    uploadTargets = ['acce', 'gyro'],
    buildingName = 'Fixture Building',
    floorLevel = 3,
    floorName = `${floorLevel}F`,
  } = params

  const building = await db
    .insertInto('buildings')
    .values({ name: buildingName })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      level: floorLevel,
      name: floorName,
      image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .defaultValues()
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const recording = await insertRecording(
    {
      pedestrian_id: pedestrian.id,
      floor_id: floor.id,
      upload_status: uploadStatus,
      upload_targets: uploadTargets,
    },
    db
  )

  return {
    buildingId: building.id,
    floorId: floor.id,
    pedestrianId: pedestrian.id,
    recordingId: recording.id,
    building,
    floor,
    pedestrian,
    recording,
  }
}
