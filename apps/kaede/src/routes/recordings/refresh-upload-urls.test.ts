import { beforeEach, describe, expect, it, vi } from 'vitest'

const { refreshUploadUrlsMock } = vi.hoisted(() => ({
  refreshUploadUrlsMock: vi.fn(),
}))

vi.mock('../../usecases/init-recording.js', () => ({
  initRecording: vi.fn(),
}))

vi.mock('../../usecases/refresh-upload-urls.js', () => ({
  refreshUploadUrls: refreshUploadUrlsMock,
}))

import { createApp } from '../../server.js'

describe('POST /api/recordings/:recordingId/refresh-upload-urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('署名付き URL を再発行して返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    refreshUploadUrlsMock.mockResolvedValue({
      ok: true,
      value: {
        recording_id: recordingId,
        upload_status: 'accepted',
        upload_urls: {
          acce: 'https://example.test/acce',
          gyro: 'https://example.test/gyro',
        },
        expires_at: '2026-05-15T00:15:00.000Z',
      },
    })

    const app = createApp()
    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
      },
      expires_at: '2026-05-15T00:15:00.000Z',
    })

    expect(refreshUploadUrlsMock).toHaveBeenCalledWith(
      {
        recordingId,
      },
      {
        targets: ['acce', 'gyro'],
      }
    )
  })

  it('存在しない recording は 404 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    refreshUploadUrlsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })

    const app = createApp()
    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_FOUND',
      error_message: 'recording not found',
      details: {
        recording_id: recordingId,
      },
    })
  })

  it('accepted 以外の recording は 409 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    refreshUploadUrlsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
        recordingId,
        uploadStatus: 'ready',
      },
    })

    const app = createApp()
    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
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

  it('recording に含まれない target は 409 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    refreshUploadUrlsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId,
        invalidTargets: ['pressure'],
      },
    })

    const app = createApp()
    const response = await app.request(`/api/recordings/${recordingId}/refresh-upload-urls`, {
      method: 'POST',
      headers: {
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

  it('不正な path/body はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createApp()
    const response = await app.request('/api/recordings/not-a-uuid/refresh-upload-urls', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targets: [],
      }),
    })

    expect(response.status).toBe(400)
    expect(refreshUploadUrlsMock).not.toHaveBeenCalled()
  })
})
