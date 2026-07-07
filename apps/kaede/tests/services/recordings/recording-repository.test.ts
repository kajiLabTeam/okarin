import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findRecordingById,
  insertRecording,
  markRecordingUploadFailed,
  markRecordingUploadReady,
  updateRecordingConstraints,
} from '../../../src/services/recordings/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const createRecordingParents = async (suffix: string) => {
  const organization = await db
    .insertInto('organizations')
    .values({ name: `Recording Test Organization ${suffix}` })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const building = await db
    .insertInto('buildings')
    .values({ name: `Building ${suffix}`, organization_id: organization.id })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      organization_id: organization.id,
      level: 1,
      name: '1F',
      image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .values({
      display_name: `Recording Test Pedestrian ${suffix}`,
      organization_id: organization.id,
      user_id: null,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return { organization, building, floor, pedestrian }
}

describe('recording repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('recording を登録して取得できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('A')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )

    const found = await findRecordingById(created.id, db)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
    expect(found?.upload_status).toBe('accepted')
  })

  it('upload_status を ready に更新できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('B')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro', 'wifi'],
      },
      db
    )

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated?.upload_status).toBe('ready')
  })

  it('accepted 以外の upload_status は ready に更新しない', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('C')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )

    await markRecordingUploadFailed(created.id, db)

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated).toBeUndefined()
  })

  it('constraints を全置換できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('D')
    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]

    const updated = await updateRecordingConstraints(created.id, constraints, db)

    expect(updated?.constraints).toEqual(constraints)
  })
})
