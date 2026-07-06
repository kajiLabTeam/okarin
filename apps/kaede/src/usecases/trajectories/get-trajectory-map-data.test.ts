import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const { findTrajectoryByIdMock, getTrajectoryAnalyzedResultObjectTextMock } = vi.hoisted(() => ({
  findTrajectoryByIdMock: vi.fn(),
  getTrajectoryAnalyzedResultObjectTextMock: vi.fn(),
}))

vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: findTrajectoryByIdMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  getTrajectoryAnalyzedResultObjectText: getTrajectoryAnalyzedResultObjectTextMock,
}))

import { getTrajectoryMapData } from './get-trajectory-map-data.js'

const managerActor: UserRequestActor = {
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

const memberActor: UserRequestActor = {
  ...managerActor,
  memberships: [
    {
      organization_id: '11111111-1111-4111-8111-111111111111',
      organization_name: 'Group A',
      role: 'member',
    },
  ],
}

describe('getTrajectoryMapData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completed trajectory の analyzed result CSV を points に変換する', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    const floorId = '33333333-3333-4333-8333-333333333333'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      floor_id: floorId,
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })
    getTrajectoryAnalyzedResultObjectTextMock.mockResolvedValue('x,y\n10,20\n10.5,20.25\n')

    const result = await getTrajectoryMapData(
      managerActor,
      { trajectoryId },
      { data_type: 'analyzed' }
    )

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        floor_id: floorId,
        data_type: 'analyzed',
        points: [
          { timestamp: 0, x: 10, y: 20 },
          { timestamp: 1, x: 10.5, y: 20.25 },
        ],
      },
    })
  })

  it('completed 以外は TRAJECTORY_MAP_DATA_NOT_READY を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
    })

    const result = await getTrajectoryMapData(
      managerActor,
      { trajectoryId },
      { data_type: 'analyzed' }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_NOT_READY',
        trajectoryId,
        status: 'processing',
      },
    })
    expect(getTrajectoryAnalyzedResultObjectTextMock).not.toHaveBeenCalled()
  })

  it('result object がなければ TRAJECTORY_MAP_DATA_NOT_FOUND を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })
    getTrajectoryAnalyzedResultObjectTextMock.mockResolvedValue(undefined)

    const result = await getTrajectoryMapData(
      managerActor,
      { trajectoryId },
      { data_type: 'analyzed' }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_NOT_FOUND',
        trajectoryId,
      },
    })
  })

  it('x,y がないCSVは TRAJECTORY_MAP_DATA_INVALID を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })
    getTrajectoryAnalyzedResultObjectTextMock.mockResolvedValue('latitude,longitude\n1,2\n')

    const result = await getTrajectoryMapData(
      managerActor,
      { trajectoryId },
      { data_type: 'analyzed' }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_INVALID',
        trajectoryId,
        reason: 'csv missing required columns: x, y',
      },
    })
  })

  it('member は dashboard trajectory map data を取得できない', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })

    const result = await getTrajectoryMapData(
      memberActor,
      { trajectoryId },
      { data_type: 'analyzed' }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
    expect(getTrajectoryAnalyzedResultObjectTextMock).not.toHaveBeenCalled()
  })

  it('ground_truth は未対応として返す', async () => {
    const result = await getTrajectoryMapData(
      managerActor,
      { trajectoryId: '22222222-2222-4222-8222-222222222222' },
      { data_type: 'ground_truth' }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_MAP_DATA_TYPE_UNSUPPORTED',
        dataType: 'ground_truth',
      },
    })
    expect(findTrajectoryByIdMock).not.toHaveBeenCalled()
  })
})
