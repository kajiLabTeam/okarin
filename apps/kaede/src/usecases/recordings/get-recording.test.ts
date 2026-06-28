import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const { findRecordingAuthorizationByIdMock, findRecordingByIdMock } = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

import { getRecording } from './get-recording.js'

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

describe('getRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manager は recording 詳細を取得できる', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      floor_id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
      created_at: new Date('2026-06-11T00:00:00.000Z'),
      updated_at: new Date('2026-06-11T00:00:00.000Z'),
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      organization_id: '11111111-1111-4111-8111-111111111111',
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: null,
    })

    const result = await getRecording(managerActor, {
      recordingId: '22222222-2222-4222-8222-222222222222',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: '22222222-2222-4222-8222-222222222222',
        pedestrian_id: '33333333-3333-4333-8333-333333333333',
        floor_id: '44444444-4444-4444-8444-444444444444',
        organization_id: '11111111-1111-4111-8111-111111111111',
        upload_status: 'accepted',
        upload_targets: ['acce', 'gyro'],
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
    })
  })

  it('member は dashboard recording 詳細を取得できない', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      floor_id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
      created_at: new Date('2026-06-11T00:00:00.000Z'),
      updated_at: new Date('2026-06-11T00:00:00.000Z'),
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      organization_id: '11111111-1111-4111-8111-111111111111',
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: memberActor.user_id,
    })

    const result = await getRecording(memberActor, {
      recordingId: '22222222-2222-4222-8222-222222222222',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })

  it('存在しない recording は RECORDING_NOT_FOUND を返す', async () => {
    findRecordingByIdMock.mockResolvedValue(undefined)

    const result = await getRecording(managerActor, {
      recordingId: '22222222-2222-4222-8222-222222222222',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: '22222222-2222-4222-8222-222222222222',
      },
    })
  })
})
