import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListRecordingTrajectoriesRoute } from './list-recording-trajectories.js'

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

const { listRecordingTrajectoriesMock } = vi.hoisted(() => ({
  listRecordingTrajectoriesMock: vi.fn(),
}))

vi.mock('../../usecases/recordings/list-recording-trajectories.js', () => ({
  listRecordingTrajectories: listRecordingTrajectoriesMock,
}))

describe('GET /api/recordings/:recordingId/trajectories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording 配下の trajectory 一覧を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'

    listRecordingTrajectoriesMock.mockResolvedValue({
      ok: true,
      value: {
        recording_id: recordingId,
        trajectories: [
          {
            trajectory_id: '44444444-4444-4444-8444-444444444444',
            organization_id: '11111111-1111-4111-8111-111111111111',
            status: 'completed',
            created_at: '2026-06-12T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/recordings', registerListRecordingTrajectoriesRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      trajectories: [
        {
          trajectory_id: '44444444-4444-4444-8444-444444444444',
          organization_id: '11111111-1111-4111-8111-111111111111',
          status: 'completed',
          created_at: '2026-06-12T00:00:00.000Z',
        },
      ],
    })
    expect(listRecordingTrajectoriesMock).toHaveBeenCalledWith(managerActor, {
      recordingId,
    })
  })

  it('存在しない recording は 404 を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'

    listRecordingTrajectoriesMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })

    const app = createRouteTestApp('/recordings', registerListRecordingTrajectoriesRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_FOUND',
      error_message: 'recording not found',
      details: {
        recording_id: recordingId,
      },
    })
  })

  it('dashboard 権限がない場合は 403 を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'

    listRecordingTrajectoriesMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/recordings', registerListRecordingTrajectoriesRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/recordings/${recordingId}/trajectories`)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
