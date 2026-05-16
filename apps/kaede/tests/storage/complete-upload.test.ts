import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server.js'
import { createDb } from '../../src/services/db/client.js'
import { resetDatabase } from '../db/helpers.js'
import { createStorageClient, putObjectText } from './support/helpers.js'

const db = createDb()
const app = createApp()
const s3 = createStorageClient()

const createRecordingFixture = async () => {
  const building = await db
    .insertInto('buildings')
    .values({ name: 'Fixture Building' })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      level: 3,
      name: '3F',
      image_object_path: `maps/${building.id}/33333333-3333-4333-8333-333333333333.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .defaultValues()
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const recording = await db
    .insertInto('recordings')
    .values({
      pedestrian_id: pedestrian.id,
      floor_id: floor.id,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return { recordingId: recording.id }
}

describe('POST /api/recordings/:recordingId/complete-upload', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    s3.destroy()
    await db.destroy()
  })

  it('必要な raw が揃っていれば ready に更新する', async () => {
    const { recordingId } = await createRecordingFixture()

    await putObjectText(s3, `recordings/${recordingId}/raw/acce.csv`, 'timestamp,x\n0,1\n')
    await putObjectText(s3, `recordings/${recordingId}/raw/gyro.csv`, 'timestamp,z\n0,2\n')

    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'ready',
    })

    const updated = await db
      .selectFrom('recordings')
      .select(['upload_status'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow()

    expect(updated.upload_status).toBe('ready')
  })

  it('不足 raw がある場合は missing_targets を返す', async () => {
    const { recordingId } = await createRecordingFixture()

    await putObjectText(s3, `recordings/${recordingId}/raw/acce.csv`, 'timestamp,x\n0,1\n')

    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UPLOAD_TARGETS_MISSING',
      error_message: 'some upload targets are missing',
      details: {
        recording_id: recordingId,
        missing_targets: ['gyro'],
      },
    })

    const updated = await db
      .selectFrom('recordings')
      .select(['upload_status'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow()

    expect(updated.upload_status).toBe('accepted')
  })
})
