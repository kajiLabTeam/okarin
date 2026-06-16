import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import { initRecordingResponseSchema } from '../../../src/schemas/recordings.js'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()
let app: ReturnType<typeof createApp>

const authHeaders = {
  authorization: 'Bearer shared-token',
}

describe('POST /api/recordings/init', () => {
  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    resetRuntimeConfigForTests()
    app = createApp()
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()
  })

  it('recording を作成しアップロード URL を返す', async () => {
    const { floorId, organizationId, pedestrianId } = await createRecordingFixture(db)

    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        ...authHeaders,
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
    expect(body.organization_id).toBe(organizationId)
    expect(body.upload_status).toBe('accepted')
    expect(body.upload_urls).toEqual({
      acce: expect.stringContaining(
        `/organizations/${organizationId}/recordings/${body.recording_id}/raw/acce.csv`
      ),
      gyro: expect.stringContaining(
        `/organizations/${organizationId}/recordings/${body.recording_id}/raw/gyro.csv`
      ),
      metadata: expect.stringContaining(
        `/organizations/${organizationId}/recordings/${body.recording_id}/raw/metadata.json`
      ),
      wifi: expect.stringContaining(
        `/organizations/${organizationId}/recordings/${body.recording_id}/raw/wifi.csv`
      ),
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
    expect(created?.organization_id).toBe(organizationId)
    expect(created?.upload_status).toBe('accepted')
    expect(created?.upload_targets).toEqual(['acce', 'gyro', 'wifi', 'metadata'])
  })

  it('存在しない pedestrian_id は 404 を返す', async () => {
    const { floorId } = await createRecordingFixture(db)

    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        ...authHeaders,
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

  it('存在しない floor_id は 404 を返す', async () => {
    const { pedestrianId } = await createRecordingFixture(db)

    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: '22222222-2222-4222-8222-222222222222',
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'FLOOR_NOT_FOUND',
      error_message: 'floor_id does not exist',
      details: {
        floor_id: '22222222-2222-4222-8222-222222222222',
      },
    })
  })
})
