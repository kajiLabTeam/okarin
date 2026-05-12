import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initRecordingResponseSchema } from '../../../src/schemas/recordings.js'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const app = createApp()

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

  return { floorId: floor.id, pedestrianId: pedestrian.id }
}

describe('POST /api/recordings/init', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('recording を作成しアップロード URL を返す', async () => {
    const { floorId, pedestrianId } = await createRecordingFixture()

    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro', 'wifi'],
      }),
    })

    expect(response.status).toBe(201)

    const raw = await response.json()
    const body = initRecordingResponseSchema.parse(raw)

    expect(body.recording_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(body.upload_status).toBe('accepted')
    expect(body.upload_urls).toEqual({
      acce: expect.stringContaining(`/recordings/${body.recording_id}/raw/acce.csv`),
      gyro: expect.stringContaining(`/recordings/${body.recording_id}/raw/gyro.csv`),
      wifi: expect.stringContaining(`/recordings/${body.recording_id}/raw/wifi.csv`),
    })
    expect(body.upload_urls.pressure).toBeUndefined()
    expect(Date.parse(body.expires_at)).not.toBeNaN()

    const created = await db
      .selectFrom('recordings')
      .selectAll()
      .where('id', '=', body.recording_id)
      .executeTakeFirst()

    expect(created).toBeDefined()
    expect(created?.pedestrian_id).toBe(pedestrianId)
    expect(created?.floor_id).toBe(floorId)
    expect(created?.upload_status).toBe('accepted')
    expect(created?.upload_targets).toEqual(['acce', 'gyro', 'wifi'])
  })

  it('存在しない pedestrian_id は 404 を返す', async () => {
    const { floorId } = await createRecordingFixture()

    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: '11111111-1111-4111-8111-111111111111',
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PEDESTRIAN_NOT_FOUND',
      error_message: 'pedestrian_id does not exist',
      details: {
        pedestrian_id: '11111111-1111-4111-8111-111111111111',
      },
    })
  })
})
