import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findRecordingById,
  insertRecording,
  markRecordingUploadFailed,
  markRecordingUploadReady,
} from '../../../src/services/recordings/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('recording repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('recording を登録して取得できる', async () => {
    const building = await db
      .insertInto('buildings')
      .values({ name: 'Building A' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const pedestrian = await db
      .insertInto('pedestrians')
      .defaultValues()
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
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
    const building = await db
      .insertInto('buildings')
      .values({ name: 'Building B' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        level: 2,
        name: '2F',
        image_object_path: `maps/${building.id}/22222222-2222-4222-8222-222222222222.svg`,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const pedestrian = await db
      .insertInto('pedestrians')
      .defaultValues()
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        upload_targets: ['acce', 'gyro', 'wifi'],
      },
      db
    )

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated?.upload_status).toBe('ready')
  })

  it('accepted 以外の upload_status は ready に更新しない', async () => {
    const building = await db
      .insertInto('buildings')
      .values({ name: 'Building C' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        level: 3,
        name: '3F',
        image_object_path: `maps/${building.id}/33333333-3333-4333-8333-333333333333.svg`,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const pedestrian = await db
      .insertInto('pedestrians')
      .defaultValues()
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )

    await markRecordingUploadFailed(created.id, db)

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated).toBeUndefined()
  })
})
