import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor, UserRequestActor } from '../../middleware/request-actor-context.js'

const { findTrajectoryByIdMock, softDeleteTrajectoryMock } = vi.hoisted(() => ({
  findTrajectoryByIdMock: vi.fn(),
  softDeleteTrajectoryMock: vi.fn(),
}))

vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: findTrajectoryByIdMock,
  softDeleteTrajectory: softDeleteTrajectoryMock,
}))

import { deleteTrajectory } from './delete-trajectory.js'

const trajectoryId = '22222222-2222-4222-8222-222222222222'
const organizationId = '11111111-1111-4111-8111-111111111111'

const managerActor: UserRequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Group A',
      role: 'manager',
    },
  ],
}

const memberActor: UserRequestActor = {
  ...managerActor,
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Group A',
      role: 'member',
    },
  ],
}

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const trajectory = {
  id: trajectoryId,
  recording_id: '33333333-3333-4333-8333-333333333333',
  organization_id: organizationId,
  status: 'completed',
}

describe('deleteTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manager は trajectory を論理削除できる', async () => {
    findTrajectoryByIdMock.mockResolvedValue(trajectory)
    softDeleteTrajectoryMock.mockResolvedValue({ ...trajectory, deleted_at: new Date() })

    const result = await deleteTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({ ok: true })
    expect(softDeleteTrajectoryMock).toHaveBeenCalledWith(trajectoryId)
  })

  it('member は trajectory を削除できない', async () => {
    findTrajectoryByIdMock.mockResolvedValue(trajectory)

    const result = await deleteTrajectory(memberActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    })
    expect(softDeleteTrajectoryMock).not.toHaveBeenCalled()
  })

  it('service client は trajectory を削除できない', async () => {
    findTrajectoryByIdMock.mockResolvedValue(trajectory)

    const result = await deleteTrajectory(serviceClientActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    })
    expect(softDeleteTrajectoryMock).not.toHaveBeenCalled()
  })

  it('存在しない trajectory は TRAJECTORY_NOT_FOUND を返す', async () => {
    findTrajectoryByIdMock.mockResolvedValue(undefined)

    const result = await deleteTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })
    expect(softDeleteTrajectoryMock).not.toHaveBeenCalled()
  })

  it('削除直前に対象が消えていた場合は TRAJECTORY_NOT_FOUND を返す', async () => {
    findTrajectoryByIdMock.mockResolvedValue(trajectory)
    softDeleteTrajectoryMock.mockResolvedValue(undefined)

    const result = await deleteTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })
  })
})
