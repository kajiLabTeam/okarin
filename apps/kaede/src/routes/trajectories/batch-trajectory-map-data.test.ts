import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerBatchTrajectoryMapDataRoute } from './batch-trajectory-map-data.js'

const actor: RequestActor = {
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

const { getTrajectoryMapDataMock } = vi.hoisted(() => ({ getTrajectoryMapDataMock: vi.fn() }))

vi.mock('../../usecases/trajectories/get-trajectory-map-data.js', () => ({
  getTrajectoryMapData: getTrajectoryMapDataMock,
}))

describe('POST /api/trajectories/map-data:batch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('同一フロアのtrajectoryを一括取得する', async () => {
    const floorId = '33333333-3333-4333-8333-333333333333'
    const firstId = '22222222-2222-4222-8222-222222222222'
    const secondId = '44444444-4444-4444-8444-444444444444'
    getTrajectoryMapDataMock
      .mockResolvedValueOnce({
        ok: true,
        value: {
          trajectory_id: firstId,
          floor_id: floorId,
          data_type: 'analyzed',
          points: [{ timestamp: 0, x: 1, y: 2 }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          trajectory_id: secondId,
          floor_id: floorId,
          data_type: 'analyzed',
          points: [{ timestamp: 0, x: 3, y: 4 }],
        },
      })

    const app = createRouteTestApp('/trajectories', registerBatchTrajectoryMapDataRoute, { actor })
    const response = await app.request('/api/trajectories/map-data:batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data_type: 'analyzed', trajectory_ids: [firstId, secondId] }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      floor_id: floorId,
      trajectories: [
        { trajectory_id: firstId, data_type: 'analyzed', points: [{ timestamp: 0, x: 1, y: 2 }] },
        { trajectory_id: secondId, data_type: 'analyzed', points: [{ timestamp: 0, x: 3, y: 4 }] },
      ],
    })
  })

  it('異なるフロアは比較できない', async () => {
    getTrajectoryMapDataMock
      .mockResolvedValueOnce({
        ok: true,
        value: {
          trajectory_id: '22222222-2222-4222-8222-222222222222',
          floor_id: '33333333-3333-4333-8333-333333333333',
          data_type: 'analyzed',
          points: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          trajectory_id: '44444444-4444-4444-8444-444444444444',
          floor_id: '55555555-5555-4555-8555-555555555555',
          data_type: 'analyzed',
          points: [],
        },
      })
    const app = createRouteTestApp('/trajectories', registerBatchTrajectoryMapDataRoute, { actor })
    const response = await app.request('/api/trajectories/map-data:batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data_type: 'analyzed',
        trajectory_ids: [
          '22222222-2222-4222-8222-222222222222',
          '44444444-4444-4444-8444-444444444444',
        ],
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error_code: 'TRAJECTORY_FLOOR_MISMATCH',
    })
  })
})
