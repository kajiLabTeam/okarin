import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const {
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  listTrajectoriesByRecordingIdMock,
} = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  listTrajectoriesByRecordingIdMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../../services/trajectories/index.js', () => ({
  listTrajectoriesByRecordingId: listTrajectoriesByRecordingIdMock,
}))

import { listRecordingTrajectories } from './list-recording-trajectories.js'

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

describe('listRecordingTrajectories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manager は recording 配下の trajectory 一覧を取得できる', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: null,
    })
    listTrajectoriesByRecordingIdMock.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        recording_id: recordingId,
        organization_id: organizationId,
        status: 'completed',
        created_at: new Date('2026-06-12T00:00:00.000Z'),
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        recording_id: recordingId,
        organization_id: organizationId,
        status: 'processing',
        created_at: new Date('2026-06-11T00:00:00.000Z'),
      },
    ])

    const result = await listRecordingTrajectories(managerActor, { recordingId })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        trajectories: [
          {
            trajectory_id: '44444444-4444-4444-8444-444444444444',
            organization_id: organizationId,
            status: 'completed',
            created_at: '2026-06-12T00:00:00.000Z',
          },
          {
            trajectory_id: '55555555-5555-4555-8555-555555555555',
            organization_id: organizationId,
            status: 'processing',
            created_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })
    expect(listTrajectoriesByRecordingIdMock).toHaveBeenCalledWith(recordingId)
  })

  it('member は dashboard trajectory 一覧を取得できない', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: memberActor.user_id,
    })

    const result = await listRecordingTrajectories(memberActor, { recordingId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
    expect(listTrajectoriesByRecordingIdMock).not.toHaveBeenCalled()
  })

  it('存在しない recording は RECORDING_NOT_FOUND を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'

    findRecordingByIdMock.mockResolvedValue(undefined)

    const result = await listRecordingTrajectories(managerActor, { recordingId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })
  })
})
