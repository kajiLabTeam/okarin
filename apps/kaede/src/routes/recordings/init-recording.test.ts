import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerInitRecordingRoute } from './init-recording.js'

const { initRecordingMock } = vi.hoisted(() => ({
  initRecordingMock: vi.fn(),
}))

vi.mock('../../usecases/init-recording.js', () => ({
  initRecording: initRecordingMock,
}))

describe('POST /api/recordings/init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording 作成後に署名付き URL を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    initRecordingMock.mockResolvedValue({
      ok: true,
      value: {
        recording_id: recordingId,
        organization_id: organizationId,
        upload_status: 'accepted',
        upload_urls: {
          acce: 'https://example.test/acce',
          gyro: 'https://example.test/gyro',
          metadata: 'https://example.test/metadata',
        },
        expires_at: '2026-05-13T00:15:00.000Z',
      },
    })

    const app = createRouteTestApp('/recordings', registerInitRecordingRoute)
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
      organization_id: organizationId,
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
        metadata: 'https://example.test/metadata',
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

    initRecordingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId,
      },
    })

    const app = createRouteTestApp('/recordings', registerInitRecordingRoute)
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

    initRecordingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
        pedestrianId,
      },
    })

    const app = createRouteTestApp('/recordings', registerInitRecordingRoute)
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

  it('pedestrian と floor の organization が異なる場合は 409 を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    initRecordingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RESOURCE_ORGANIZATION_MISMATCH',
        pedestrianId,
        pedestrianOrganizationId: '99999999-9999-4999-8999-999999999999',
        floorId,
        floorOrganizationId: '88888888-8888-4888-8888-888888888888',
      },
    })

    const app = createRouteTestApp('/recordings', registerInitRecordingRoute)
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

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RESOURCE_ORGANIZATION_MISMATCH',
      error_message: 'pedestrian and floor belong to different organizations',
      details: {
        pedestrian_id: pedestrianId,
        pedestrian_organization_id: '99999999-9999-4999-8999-999999999999',
        floor_id: floorId,
        floor_organization_id: '88888888-8888-4888-8888-888888888888',
      },
    })
  })

  it('不正な upload_targets はバリデーションエラーを返し usecase を呼ばない', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    const app = createRouteTestApp('/recordings', registerInitRecordingRoute)
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce'],
      }),
    })

    expect(response.status).toBe(400)
    expect(initRecordingMock).not.toHaveBeenCalled()
  })
})
