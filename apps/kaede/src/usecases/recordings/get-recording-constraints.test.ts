import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const { findRecordingAuthorizationByIdMock, findRecordingByIdMock } = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

import { getRecordingConstraints } from './get-recording-constraints.js'

const recordingId = '11111111-1111-4111-8111-111111111111'
const organizationId = '99999999-9999-4999-8999-999999999999'
const userId = '22222222-2222-4222-8222-222222222222'
const memberActor: RequestActor = {
  type: 'user',
  user_id: userId,
  email: 'member@example.test',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    { organization_id: organizationId, organization_name: 'Test Organization', role: 'member' },
  ],
}

describe('getRecordingConstraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('本人の recording constraints を返す', async () => {
    const constraints = [{ seq: 0, point_type: 'start', x: 10, y: 20 }]
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, constraints })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: userId,
    })

    await expect(getRecordingConstraints(memberActor, { recordingId })).resolves.toEqual({
      ok: true,
      value: { recording_id: recordingId, constraints },
    })
  })

  it('認可後に不正な DB constraints を検出する', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      constraints: [{ seq: 1, point_type: 'start', x: 10, y: 20 }],
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: userId,
    })

    await expect(getRecordingConstraints(memberActor, { recordingId })).resolves.toEqual({
      ok: false,
      error: { type: 'RECORDING_CONSTRAINTS_INVALID', recordingId },
    })
  })

  it('他人の recording は拒否する', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, constraints: 'invalid' })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_user_id: '44444444-4444-4444-8444-444444444444',
    })

    await expect(getRecordingConstraints(memberActor, { recordingId })).resolves.toEqual({
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    })
  })
})
