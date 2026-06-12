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
  organizationName?: string
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
    organizationName = 'Fixture Organization',
  } = params

  const organization = await db
    .insertInto('organizations')
    .values({ name: organizationName })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const building = await db
    .insertInto('buildings')
    .values({ name: buildingName, organization_id: organization.id })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      organization_id: organization.id,
      level: floorLevel,
      name: floorName,
      image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .values({
      display_name: 'Fixture Pedestrian',
      organization_id: organization.id,
      user_id: null,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const recording = await insertRecording(
    {
      pedestrian_id: pedestrian.id,
      floor_id: floor.id,
      organization_id: organization.id,
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
    organizationId: organization.id,
    organization,
    building,
    floor,
    pedestrian,
    recording,
  }
}
