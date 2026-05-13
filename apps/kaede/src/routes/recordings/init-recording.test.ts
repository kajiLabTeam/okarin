import { beforeEach, describe, expect, it, vi } from 'vitest'

const { initRecordingMock } = vi.hoisted(() => ({
  initRecordingMock: vi.fn(),
}))

vi.mock('../../usecases/init-recording.js', () => {
  class PedestrianNotFoundError extends Error {
    pedestrianId: string

    constructor(pedestrianId: string) {
      super('pedestrian_id does not exist')
      this.pedestrianId = pedestrianId
    }
  }

  class FloorNotFoundError extends Error {
    floorId: string

    constructor(floorId: string) {
      super('floor_id does not exist')
      this.floorId = floorId
    }
  }

  return {
    initRecording: initRecordingMock,
    PedestrianNotFoundError,
    FloorNotFoundError,
  }
})

import { createApp } from '../../server.js'

describe('POST /api/recordings/init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording 作成後に署名付き URL を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'

    initRecordingMock.mockResolvedValue({
      recording_id: recordingId,
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
      },
      expires_at: '2026-05-13T00:15:00.000Z',
    })

    const app = createApp()
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
      },
      expires_at: '2026-05-13T00:15:00.000Z',
    })

    expect(initRecordingMock).toHaveBeenCalledWith({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })
  })

  it('存在しない floor_id は 404 を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const { FloorNotFoundError } = await import('../../usecases/init-recording.js')

    initRecordingMock.mockRejectedValue(new FloorNotFoundError(floorId))

    const app = createApp()
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'FLOOR_NOT_FOUND',
      error_message: 'floor_id does not exist',
      details: {
        floor_id: floorId,
      },
    })
  })

  it('存在しない pedestrian_id は 404 を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const { PedestrianNotFoundError } = await import('../../usecases/init-recording.js')

    initRecordingMock.mockRejectedValue(new PedestrianNotFoundError(pedestrianId))

    const app = createApp()
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PEDESTRIAN_NOT_FOUND',
      error_message: 'pedestrian_id does not exist',
      details: {
        pedestrian_id: pedestrianId,
      },
    })
  })
})
