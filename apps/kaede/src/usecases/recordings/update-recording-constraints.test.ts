import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const { findRecordingByIdMock, persistRecordingConstraintsMock } = vi.hoisted(() => ({
  findRecordingByIdMock: vi.fn(),
  persistRecordingConstraintsMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingById: findRecordingByIdMock,
  updateRecordingConstraints: persistRecordingConstraintsMock,
}))

import { updateRecordingConstraints } from './update-recording-constraints.js'

const recordingId = '11111111-1111-4111-8111-111111111111'
const organizationId = '99999999-9999-4999-8999-999999999999'
const userActor = (role: 'member' | 'manager' | 'owner'): RequestActor => ({
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: `${role}@example.test`,
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Test', role }],
})

describe('updateRecordingConstraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, organization_id: organizationId })
  })

  it.each(['manager', 'owner'] as const)('%s は constraints を全置換できる', async (role) => {
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]
    persistRecordingConstraintsMock.mockResolvedValue({ id: recordingId })

    await expect(
      updateRecordingConstraints(userActor(role), { recordingId }, { constraints })
    ).resolves.toEqual({
      ok: true,
      value: { recording_id: recordingId, constraints },
    })
    expect(persistRecordingConstraintsMock).toHaveBeenCalledWith(recordingId, constraints)
  })

  it.each([
    ['service client', { type: 'service_client', name: 'shared_token' } as const],
    ['member', userActor('member')],
  ])('%s は更新できない', async (_label, actor) => {
    await expect(
      updateRecordingConstraints(actor, { recordingId }, { constraints: [] })
    ).resolves.toEqual({
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    })
    expect(persistRecordingConstraintsMock).not.toHaveBeenCalled()
  })

  it('global admin は任意 organization の constraints を更新できる', async () => {
    const actor: RequestActor = {
      type: 'user',
      user_id: '55555555-5555-4555-8555-555555555555',
      email: 'admin@example.test',
      global_role: 'admin',
      account_state: 'active',
      memberships: [],
    }
    persistRecordingConstraintsMock.mockResolvedValue({ id: recordingId })

    await expect(
      updateRecordingConstraints(actor, { recordingId }, { constraints: [] })
    ).resolves.toEqual({
      ok: true,
      value: { recording_id: recordingId, constraints: [] },
    })
  })
})
