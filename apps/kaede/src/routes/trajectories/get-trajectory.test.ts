import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetTrajectoryRoute } from './get-trajectory.js'

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

const { getTrajectoryMock } = vi.hoisted(() => ({
  getTrajectoryMock: vi.fn(),
}))

vi.mock('../../usecases/trajectories/get-trajectory.js', () => ({
  getTrajectory: getTrajectoryMock,
}))

describe('GET /api/trajectories/:trajectoryId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trajectory 状態を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMock.mockResolvedValue({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: '33333333-3333-4333-8333-333333333333',
        organization_id: '11111111-1111-4111-8111-111111111111',
        status: 'processing',
        error_code: null,
        error_message: null,
        failed_at: null,
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectoryId,
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
      error_code: null,
      error_message: null,
      failed_at: null,
    })
    expect(getTrajectoryMock).toHaveBeenCalledWith(managerActor, {
      trajectoryId,
    })
  })

  it('存在しない trajectory は 404 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`)

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

    getTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
