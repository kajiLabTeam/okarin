import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListMyRecordingsRoute } from './list-my-recordings.js'

const userActor: RequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const { listMyRecordingsMock } = vi.hoisted(() => ({
  listMyRecordingsMock: vi.fn(),
}))

vi.mock('../../usecases/pedestrians/list-my-recordings.js', () => ({
  listMyRecordings: listMyRecordingsMock,
}))

describe('GET /api/pedestrians/me/recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('自分の pedestrian に紐づく recording 一覧を返す', async () => {
    listMyRecordingsMock.mockResolvedValue({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: '22222222-2222-4222-8222-222222222222',
            pedestrian_id: '33333333-3333-4333-8333-333333333333',
            floor_id: '44444444-4444-4444-8444-444444444444',
            organization_id: '11111111-1111-4111-8111-111111111111',
            upload_status: 'ready',
            upload_targets: ['acce', 'gyro'],
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/pedestrians', registerListMyRecordingsRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/pedestrians/me/recordings')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recordings: [
        {
          recording_id: '22222222-2222-4222-8222-222222222222',
          pedestrian_id: '33333333-3333-4333-8333-333333333333',
          floor_id: '44444444-4444-4444-8444-444444444444',
          organization_id: '11111111-1111-4111-8111-111111111111',
          upload_status: 'ready',
          upload_targets: ['acce', 'gyro'],
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    })
    expect(listMyRecordingsMock).toHaveBeenCalledWith(userActor)
  })

  it('紐づく pedestrian がない場合は 404 を返す', async () => {
    listMyRecordingsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerListMyRecordingsRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/pedestrians/me/recordings')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PEDESTRIAN_NOT_FOUND',
      error_message: 'pedestrian not found',
    })
  })

  it('service client は 403 を返す', async () => {
    listMyRecordingsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerListMyRecordingsRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/pedestrians/me/recordings')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
