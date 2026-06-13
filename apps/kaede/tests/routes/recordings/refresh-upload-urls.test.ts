import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import { refreshUploadUrlsResponseSchema } from '../../../src/schemas/recordings.js'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()
let app: ReturnType<typeof createApp>

const authHeaders = {
  authorization: 'Bearer shared-token',
}

describe('POST /api/recordings/:recordingId/refresh-upload-urls', () => {
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

  it('accepted な recording に対して upload URL を再発行する', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro', 'wifi'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'wifi'],
      }),
    })

    expect(response.status).toBe(200)

    const raw = await response.json()
    const body = refreshUploadUrlsResponseSchema.parse(raw)

    expect(body.recording_id).toBe(recordingId)
    expect(body.upload_status).toBe('accepted')
    expect(body.upload_urls).toEqual({
      acce: expect.stringContaining(`/recordings/${recordingId}/raw/acce.csv`),
      wifi: expect.stringContaining(`/recordings/${recordingId}/raw/wifi.csv`),
    })
    expect(body.upload_urls.gyro).toBeUndefined()
    expect(Date.parse(body.expires_at)).not.toBeNaN()
  })

  it('存在しない recording は 404 を返す', async () => {
    const response = await app.request(
      '/api/recordings/11111111-1111-4111-8111-111111111111/refresh-upload-urls',
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targets: ['acce', 'gyro'],
        }),
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_FOUND',
      error_message: 'recording not found',
      details: {
        recording_id: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  it('accepted 以外の recording は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro', 'wifi'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
      error_message: 'upload url refresh is not allowed in the current upload state',
      details: {
        recording_id: recordingId,
        upload_status: 'ready',
      },
    })
  })

  it('failed 状態の recording は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'failed',
      uploadTargets: ['acce', 'gyro', 'wifi'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
      error_message: 'upload url refresh is not allowed in the current upload state',
      details: {
        recording_id: recordingId,
        upload_status: 'failed',
      },
    })
  })

  it('recording に含まれない target の再発行は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro', 'wifi'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['pressure'],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_TARGETS_INVALID',
      error_message: 'requested targets are not allowed for this recording',
      details: {
        recording_id: recordingId,
        invalid_targets: ['pressure'],
      },
    })
  })

  it('一部に不正 target が含まれる場合は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro', 'wifi'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'pressure'],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_TARGETS_INVALID',
      error_message: 'requested targets are not allowed for this recording',
      details: {
        recording_id: recordingId,
        invalid_targets: ['pressure'],
      },
    })
  })
})
