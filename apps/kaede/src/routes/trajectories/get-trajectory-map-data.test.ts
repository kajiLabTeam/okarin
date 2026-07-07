import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetTrajectoryMapDataRoute } from './get-trajectory-map-data.js'

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

const { getTrajectoryMapDataMock } = vi.hoisted(() => ({
  getTrajectoryMapDataMock: vi.fn(),
}))

vi.mock('../../usecases/trajectories/get-trajectory-map-data.js', () => ({
  getTrajectoryMapData: getTrajectoryMapDataMock,
}))

describe('GET /api/trajectories/:trajectoryId/map-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trajectory map data を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMapDataMock.mockResolvedValue({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        floor_id: '33333333-3333-4333-8333-333333333333',
        data_type: 'analyzed',
        points: [
          { timestamp: 0, x: 10, y: 20 },
          { timestamp: 1, x: 10.5, y: 20.25 },
        ],
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryMapDataRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/map-data?data_type=analyzed`
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectoryId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      data_type: 'analyzed',
      points: [
        { timestamp: 0, x: 10, y: 20 },
        { timestamp: 1, x: 10.5, y: 20.25 },
      ],
    })
    expect(getTrajectoryMapDataMock).toHaveBeenCalledWith(
      managerActor,
      {
        trajectoryId,
      },
      {
        data_type: 'analyzed',
      }
    )
  })

  it('completed 以外は 409 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMapDataMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_NOT_READY',
        trajectoryId,
        status: 'processing',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryMapDataRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/map-data?data_type=analyzed`
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_MAP_DATA_NOT_READY',
      error_message: 'trajectory map data is not ready',
      details: {
        trajectory_id: trajectoryId,
        status: 'processing',
      },
    })
  })

  it('CSVが不正なら 422 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMapDataMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_INVALID',
        trajectoryId,
        reason: 'csv missing required columns: x, y',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryMapDataRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/map-data?data_type=analyzed`
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_MAP_DATA_INVALID',
      error_message: 'trajectory map data is invalid',
      details: {
        trajectory_id: trajectoryId,
        reason: 'csv missing required columns: x, y',
      },
    })
  })

  it('未対応 data_type は 400 を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    getTrajectoryMapDataMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED',
        dataType: 'ground_truth',
      },
    })

    const app = createRouteTestApp('/trajectories', registerGetTrajectoryMapDataRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/map-data?data_type=ground_truth`
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED',
      error_message: 'trajectory map data type is unsupported',
      details: {
        data_type: 'ground_truth',
      },
    })
  })
})
