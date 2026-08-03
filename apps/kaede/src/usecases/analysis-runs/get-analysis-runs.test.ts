import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { getAnalysisRunResult } from './get-analysis-runs.js'

const mocks = vi.hoisted(() => ({
  expire: vi.fn(),
  findRun: vi.fn(),
  listStates: vi.fn(),
  getHeatmap: vi.fn(),
  issueCsvUrl: vi.fn(),
}))

vi.mock('../../services/analysis-runs/index.js', () => ({
  expireTimedOutAnalysisRuns: mocks.expire,
  findOrganizationAnalysisRunById: mocks.findRun,
  listAnalysisRunTrajectoryStates: mocks.listStates,
  listOrganizationAnalysisRuns: vi.fn(),
}))
vi.mock('../../services/storage/index.js', () => ({
  getAnalysisHeatmapObjectText: mocks.getHeatmap,
  issueAnalysisTrajectoryCsvDownloadUrl: mocks.issueCsvUrl,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const runId = '22222222-2222-4222-8222-222222222222'
const floorId = '33333333-3333-4333-8333-333333333333'
const activeId = '44444444-4444-4444-8444-444444444444'
const deletedId = '55555555-5555-4555-8555-555555555555'
const actor: RequestActor = {
  type: 'user',
  user_id: '66666666-6666-4666-8666-666666666666',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Test', role: 'manager' }],
}

describe('getAnalysisRunResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.expire.mockResolvedValue(0)
    mocks.findRun.mockResolvedValue({
      id: runId,
      organization_id: organizationId,
      floor_id: floorId,
      analysis_type: 'stay_heatmap',
      status: 'completed',
      definition_version: 'original-v1',
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
      error_code: null,
    })
    mocks.listStates.mockResolvedValue([
      { analysis_run_id: runId, trajectory_id: activeId, seq: 0, deleted: false },
      { analysis_run_id: runId, trajectory_id: deletedId, seq: 1, deleted: true },
    ])
    mocks.getHeatmap.mockResolvedValue(
      JSON.stringify({
        schema_version: '1.0',
        definition_version: 'original-v1',
        parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
        floor_map: { width_px: 100, height_px: 200, scale_m_per_px: 0.01 },
        grid: { size_m: 1, column_count: 1, row_count: 2 },
        input_trajectory_count: 2,
        trajectories: [
          {
            trajectory_id: activeId,
            cells: [{ grid_column: 0, grid_row: 0, stay_cell_visit_count: 3 }],
          },
          {
            trajectory_id: deletedId,
            cells: [{ grid_column: 0, grid_row: 0, stay_cell_visit_count: 7 }],
          },
        ],
      })
    )
    mocks.issueCsvUrl.mockResolvedValue({
      downloadUrl: 'https://storage.test/stay.csv',
      expiresAt: '2026-08-04T00:15:00.000Z',
    })
  })

  it('削除済みtrajectoryを除外してcellとCSVを返す', async () => {
    const result = await getAnalysisRunResult(actor, organizationId, runId)

    expect(result).toMatchObject({
      ok: true,
      value: {
        trajectory_counts: { input: 2, included: 1, excluded_deleted: 1 },
        grid: {
          cells: [
            {
              grid_column: 0,
              grid_row: 0,
              total_stay_cell_visit_count: 3,
              mean_stay_cell_visit_count: 3,
            },
          ],
        },
        trajectory_csvs: [{ trajectory_id: activeId }],
      },
    })
    expect(mocks.issueCsvUrl).toHaveBeenCalledTimes(1)
    expect(mocks.expire).toHaveBeenCalledOnce()
  })

  it('processingの結果取得を拒否する', async () => {
    mocks.findRun.mockResolvedValue({ status: 'processing', error_code: null })

    await expect(getAnalysisRunResult(actor, organizationId, runId)).resolves.toEqual({
      ok: false,
      error: { type: 'ANALYSIS_RESULT_NOT_READY', status: 'processing', errorCode: null },
    })
  })
})
