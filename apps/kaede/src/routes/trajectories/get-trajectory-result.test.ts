import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetTrajectoryResultRoute } from './get-trajectory-result.js'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: '11111111-1111-4111-8111-111111111111',
      organization_name: 'Group A',
      role: 'manager',
    },
  ],
}

const { getTrajectoryResultMock } = vi.hoisted(() => ({
  getTrajectoryResultMock: vi.fn(),
}))

vi.mock('../../usecases/trajectories/get-trajectory-result.js', () => ({
  getTrajectoryResult: getTrajectoryResultMock,
}))

describe('GET /api/trajectories/:trajectoryId/result', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trajectory result download URL を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryResultMock.mockResolvedValue({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        download_url: 'https://storage.example.test/result.csv',
        expires_at: '2026-07-07T00:30:00.000Z',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryResultRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}/result`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectoryId,
      download_url: 'https://storage.example.test/result.csv',
      expires_at: '2026-07-07T00:30:00.000Z',
    })
    expect(getTrajectoryResultMock).toHaveBeenCalledWith(managerActor, {
      trajectoryId,
    })
  })

  it('completed 以外は 409 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryResultMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_RESULT_NOT_READY',
        trajectoryId,
        status: 'processing',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryResultRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}/result`)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_RESULT_NOT_READY',
      error_message: 'trajectory result is not ready',
      details: {
        trajectory_id: trajectoryId,
        status: 'processing',
      },
    })
  })

  it('存在しない trajectory は 404 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryResultMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryResultRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}/result`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_NOT_FOUND',
      error_message: 'trajectory not found',
      details: {
        trajectory_id: trajectoryId,
      },
    })
  })

  it('dashboard 権限がない場合は 403 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryResultMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryResultRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}/result`)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
