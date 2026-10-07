import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const { findTrajectoryByIdMock } = vi.hoisted(() => ({
  findTrajectoryByIdMock: vi.fn(),
}))

vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: findTrajectoryByIdMock,
}))

import { getTrajectory } from './get-trajectory.js'

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

describe('getTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manager は trajectory 状態を取得できる', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      error_code: 'RIKKA_ANALYSIS_FAILED',
      error_message: 'analysis failed',
      failed_at: new Date('2026-07-05T00:00:00.000Z'),
    })

    const result = await getTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: '33333333-3333-4333-8333-333333333333',
        organization_id: '11111111-1111-4111-8111-111111111111',
        status: 'failed',
        error_code: 'RIKKA_ANALYSIS_FAILED',
        error_message: 'analysis failed',
        failed_at: '2026-07-05T00:00:00.000Z',
        execution: null,
      },
    })
  })

  it('processing trajectory の失敗情報は null で返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
      error_code: null,
      error_message: null,
      failed_at: null,
    })

    const result = await getTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: '33333333-3333-4333-8333-333333333333',
        organization_id: '11111111-1111-4111-8111-111111111111',
        status: 'processing',
        error_code: null,
        error_message: null,
        failed_at: null,
        execution: null,
      },
    })
  })

  it('execution メタデータを含む trajectory 状態を取得できる', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
      error_code: null,
      error_message: null,
      failed_at: null,
      execution: {
        analysis_run_id: '77777777-7777-4777-8777-777777777777',
        analysis_run_item_id: '88888888-8888-4888-8888-888888888888',
        pipeline_id: 'pdr-ble',
        pipeline_version: '1.0.0',
        pipeline_digest: 'sha256:abc',
        parameters: { step_length: 0.7 },
        inputs: { recording: { asset_id: '99999999-9999-4999-8999-999999999999' } },
        executed_at: '2026-10-08T00:00:00.000Z',
      },
    })

    const result = await getTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: '33333333-3333-4333-8333-333333333333',
        organization_id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        error_code: null,
        error_message: null,
        failed_at: null,
        execution: {
          analysis_run_id: '77777777-7777-4777-8777-777777777777',
          analysis_run_item_id: '88888888-8888-4888-8888-888888888888',
          pipeline_id: 'pdr-ble',
          pipeline_version: '1.0.0',
          pipeline_digest: 'sha256:abc',
          parameters: { step_length: 0.7 },
          inputs: { recording: { asset_id: '99999999-9999-4999-8999-999999999999' } },
          executed_at: '2026-10-08T00:00:00.000Z',
        },
      },
    })
  })

  it('member は dashboard trajectory 状態を取得できない', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
      error_code: null,
      error_message: null,
      failed_at: null,
    })

    const result = await getTrajectory(memberActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })

  it('存在しない trajectory は TRAJECTORY_NOT_FOUND を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue(undefined)

    const result = await getTrajectory(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })
  })
})
