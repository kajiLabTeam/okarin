import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { getPositioningAnalysisRun } from './get-positioning-analysis-run.js'

const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  listItems: vi.fn(),
}))

vi.mock('../../services/analysis-runs/positioning-analysis-run-repository.js', () => ({
  findPositioningRun: mocks.findRun,
  listPositioningItems: mocks.listItems,
}))

const orgId = '11111111-1111-4111-8111-111111111111'
const runId = '22222222-2222-4222-8222-222222222222'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: orgId, organization_name: 'Org', role: 'manager' }],
}

describe('getPositioningAnalysisRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findRun.mockResolvedValue({
      id: runId,
      organization_id: orgId,
      status: 'accepted',
    })
  })

  it('全アイテムが完了している場合は status: completed と集計プログレスを返す', async () => {
    mocks.listItems.mockResolvedValue([
      {
        id: 'item-1',
        recording_id: 'rec-1',
        pipeline_id: 'pdr',
        status: 'completed',
        result_trajectory_id: 'traj-1',
        pipeline_digest: 'a'.repeat(64),
        pipeline_version: '1.0.0',
        error: null,
      },
      {
        id: 'item-2',
        recording_id: 'rec-2',
        pipeline_id: 'pdr',
        status: 'completed',
        result_trajectory_id: 'traj-2',
        pipeline_digest: 'a'.repeat(64),
        pipeline_version: '1.0.0',
        error: null,
      },
    ])

    const result = await getPositioningAnalysisRun(managerActor, orgId, runId)

    expect(result).toEqual({
      ok: true,
      value: {
        analysis_run_id: runId,
        status: 'completed',
        progress: {
          total: 2,
          queued: 0,
          processing: 0,
          completed: 2,
          failed: 0,
        },
        items: [
          {
            id: 'item-1',
            recording_id: 'rec-1',
            pipeline_id: 'pdr',
            status: 'completed',
            result_trajectory_id: 'traj-1',
            pipeline_digest: 'a'.repeat(64),
            pipeline_version: '1.0.0',
            error: null,
          },
          {
            id: 'item-2',
            recording_id: 'rec-2',
            pipeline_id: 'pdr',
            status: 'completed',
            result_trajectory_id: 'traj-2',
            pipeline_digest: 'a'.repeat(64),
            pipeline_version: '1.0.0',
            error: null,
          },
        ],
      },
    })
  })

  it('一部完了・一部失敗の場合は partially_completed を返す', async () => {
    mocks.listItems.mockResolvedValue([
      {
        id: 'item-1',
        recording_id: 'rec-1',
        pipeline_id: 'pdr',
        status: 'completed',
        result_trajectory_id: 'traj-1',
        pipeline_digest: 'a'.repeat(64),
        pipeline_version: '1.0.0',
        error: null,
      },
      {
        id: 'item-2',
        recording_id: 'rec-2',
        pipeline_id: 'pdr-ble',
        status: 'failed',
        result_trajectory_id: null,
        pipeline_digest: 'b'.repeat(64),
        pipeline_version: '1.0.0',
        error: { message: 'BLE scan data missing' },
      },
    ])

    const result = await getPositioningAnalysisRun(managerActor, orgId, runId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('partially_completed')
      expect(result.value.progress.completed).toBe(1)
      expect(result.value.progress.failed).toBe(1)
    }
  })

  it('存在しないRunの場合は ANALYSIS_RUN_NOT_FOUND を返す', async () => {
    mocks.findRun.mockResolvedValue(null)

    const result = await getPositioningAnalysisRun(managerActor, orgId, 'unknown-run')

    expect(result).toEqual({
      ok: false,
      error: { type: 'ANALYSIS_RUN_NOT_FOUND' },
    })
  })
})
