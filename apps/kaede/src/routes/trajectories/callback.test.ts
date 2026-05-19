import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCallbackRoute } from './callback.js'

const { receiveCallbackMock } = vi.hoisted(() => ({
  receiveCallbackMock: vi.fn(),
}))

vi.mock('../../usecases/receive-callback.js', () => ({
  receiveCallback: receiveCallbackMock,
}))

describe('POST /api/trajectories/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completed callback を 200 で返す', async () => {
    const trajectoryId = '11111111-1111-4111-8111-111111111111'

    receiveCallbackMock.mockResolvedValue({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        status: 'completed',
      },
    })

    const app = createRouteTestApp('/trajectories', registerCallbackRoute)
    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: trajectoryId,
        status: 'completed',
        callback_token: 'signed-token',
        result_object_key: `trajectories/${trajectoryId}/analyzed/result.csv`,
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectoryId,
      status: 'completed',
    })
  })

  it('token 不正は 401 を返す', async () => {
    receiveCallbackMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'CALLBACK_TOKEN_INVALID',
      },
    })

    const app = createRouteTestApp('/trajectories', registerCallbackRoute)
    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        status: 'failed',
        callback_token: 'signed-token',
        error_code: 'ANALYSIS_FAILED',
        error_message: 'trajectory estimation failed',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'CALLBACK_TOKEN_INVALID',
      error_message: 'callback token is invalid',
    })
  })

  it('trajectory mismatch は 409 を返す', async () => {
    receiveCallbackMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'CALLBACK_TRAJECTORY_MISMATCH',
        trajectoryId: '11111111-1111-4111-8111-111111111111',
        tokenTrajectoryId: '22222222-2222-4222-8222-222222222222',
      },
    })

    const app = createRouteTestApp('/trajectories', registerCallbackRoute)
    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        status: 'failed',
        callback_token: 'signed-token',
        error_code: 'ANALYSIS_FAILED',
        error_message: 'trajectory estimation failed',
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'CALLBACK_TRAJECTORY_MISMATCH',
      error_message: 'trajectory_id in token and body do not match',
      details: {
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        token_trajectory_id: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it('依存先失敗は 503 を返す', async () => {
    receiveCallbackMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'CALLBACK_DEPENDENCY_FAILURE',
        trajectoryId: '11111111-1111-4111-8111-111111111111',
      },
    })

    const app = createRouteTestApp('/trajectories', registerCallbackRoute)
    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        callback_token: 'signed-token',
        result_object_key: 'trajectories/11111111-1111-4111-8111-111111111111/analyzed/result.csv',
      }),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error_code: 'CALLBACK_DEPENDENCY_FAILURE',
      error_message: 'failed to verify object or update trajectory state',
      details: {
        trajectory_id: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  it('不正な payload は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/trajectories', registerCallbackRoute)
    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        callback_token: 'signed-token',
      }),
    })

    expect(response.status).toBe(400)
    expect(receiveCallbackMock).not.toHaveBeenCalled()
  })
})
