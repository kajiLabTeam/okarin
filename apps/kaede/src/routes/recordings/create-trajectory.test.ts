import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateTrajectoryRoute } from './create-trajectory.js'

const { createTrajectoryMock } = vi.hoisted(() => ({
  createTrajectoryMock: vi.fn(),
}))

vi.mock('../../usecases/create-trajectory.js', () => ({
  createTrajectory: createTrajectoryMock,
}))

describe('POST /api/recordings/:recordingId/trajectories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trajectory を processing として返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    createTrajectoryMock.mockResolvedValue({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: recordingId,
        status: 'processing',
      },
    })

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectoryId,
      recording_id: recordingId,
      status: 'processing',
    })
    expect(createTrajectoryMock).toHaveBeenCalledWith(
      {
        recordingId,
      },
      {
        constraints: [],
      }
    )
  })

  it('存在しない recording は 404 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    createTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
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

  it('ready でない recording は 409 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    createTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_NOT_READY',
        recordingId,
        uploadStatus: 'accepted',
      },
    })

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_READY',
      error_message: 'recording is not ready for trajectory creation',
      details: {
        recording_id: recordingId,
        upload_status: 'accepted',
      },
    })
  })

  it('nozomi 依頼失敗は 502 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    createTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'NOZOMI_REQUEST_FAILED',
        recordingId,
        trajectoryId,
      },
    })

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error_code: 'NOZOMI_REQUEST_FAILED',
      error_message: 'failed to submit analyze request to nozomi',
      details: {
        recording_id: recordingId,
        trajectory_id: trajectoryId,
      },
    })
  })

  it('解析依頼準備失敗は 500 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    createTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
        recordingId,
        trajectoryId,
      },
    })

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
      error_message: 'failed to prepare analyze request',
      details: {
        recording_id: recordingId,
        trajectory_id: trajectoryId,
      },
    })
  })

  it('不正な constraints は 400 を返し usecase を呼ばない', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    const app = createRouteTestApp('/recordings', registerCreateTrajectoryRoute)
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [
          {
            seq: 0,
            point_type: 'goal',
            x: 12.34,
            y: 56.78,
          },
        ],
      }),
    })

    expect(response.status).toBe(400)
    expect(createTrajectoryMock).not.toHaveBeenCalled()
  })
})
