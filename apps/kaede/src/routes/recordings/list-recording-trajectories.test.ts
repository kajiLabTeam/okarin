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
        pagination: {
          next_cursor: null,
          total_count: 1,
        },
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
      pagination: {
        next_cursor: null,
        total_count: 1,
      },
    })
    expect(listRecordingTrajectoriesMock).toHaveBeenCalledWith(
      managerActor,
      {
        recordingId,
      },
      { limit: 20 }
    )
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

  it('pagination query が不正な場合は 400 を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    const app = createRouteTestApp('/recordings', registerListRecordingTrajectoriesRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/recordings/${recordingId}/trajectories?limit=20&limit=30`
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PAGINATION_QUERY_INVALID',
      error_message: 'pagination query is invalid',
    })
    expect(listRecordingTrajectoriesMock).not.toHaveBeenCalled()
  })

  it('cursor payload が不正な場合は 400 を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    listRecordingTrajectoriesMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'PAGINATION_CURSOR_INVALID',
      },
    })
    const app = createRouteTestApp('/recordings', registerListRecordingTrajectoriesRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/recordings/${recordingId}/trajectories?cursor=invalid-but-basic-query`
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PAGINATION_CURSOR_INVALID',
      error_message: 'pagination cursor is invalid',
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
