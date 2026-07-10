import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerDeleteTrajectoryRoute } from './delete-trajectory.js'

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

const { deleteTrajectoryMock } = vi.hoisted(() => ({
  deleteTrajectoryMock: vi.fn(),
}))

vi.mock('../../usecases/trajectories/delete-trajectory.js', () => ({
  deleteTrajectory: deleteTrajectoryMock,
}))

describe('DELETE /api/trajectories/:trajectoryId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trajectory を削除し 204 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    deleteTrajectoryMock.mockResolvedValue({ ok: true })

    const app = createRouteTestApp('/trajectories', registerDeleteTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(deleteTrajectoryMock).toHaveBeenCalledWith(managerActor, {
      trajectoryId,
    })
  })

  it('存在しない trajectory は 404 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    deleteTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })

    const app = createRouteTestApp('/trajectories', registerDeleteTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_NOT_FOUND',
      error_message: 'trajectory not found',
      details: {
        trajectory_id: trajectoryId,
      },
    })
  })

  it('dashboard write 権限がない場合は 403 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    deleteTrajectoryMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/trajectories', registerDeleteTrajectoryRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/trajectories/${trajectoryId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
