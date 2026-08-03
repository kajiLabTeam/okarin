import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerAnalysisRunRoutes } from './analysis-runs.js'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  getResult: vi.fn(),
}))

vi.mock('../../usecases/analysis-runs/get-analysis-runs.js', () => ({
  listAnalysisRuns: mocks.list,
  getAnalysisRun: mocks.get,
  getAnalysisRunResult: mocks.getResult,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const analysisRunId = '22222222-2222-4222-8222-222222222222'
const floorId = '33333333-3333-4333-8333-333333333333'
const trajectoryId = '44444444-4444-4444-8444-444444444444'
const actor: RequestActor = {
  type: 'user',
  user_id: '55555555-5555-4555-8555-555555555555',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Test', role: 'manager' }],
}

const createApp = () => createRouteTestApp('/organizations', registerAnalysisRunRoutes, { actor })

const runSummary = {
  analysis_run_id: analysisRunId,
  analysis_type: 'stay_heatmap',
  status: 'completed',
  floor_id: floorId,
  parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
  definition_version: 'original-v1',
  trajectory_counts: { input: 1, included: 1, excluded_deleted: 0 },
  error: null,
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:01:00.000Z',
  finished_at: '2026-08-04T00:01:00.000Z',
} as const

describe('organization analysis run routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('一覧queryをusecaseへ渡してrun一覧を返す', async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      value: {
        analysis_runs: [runSummary],
        pagination: { next_cursor: null, total_count: 1 },
      },
    })
    const app = createApp()
    const response = await app.request(
      `/api/organizations/${organizationId}/analysis-runs?limit=10&analysis_type=stay_heatmap&status=completed&floor_id=${floorId}`
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      analysis_runs: [runSummary],
      pagination: { next_cursor: null, total_count: 1 },
    })
    expect(mocks.list).toHaveBeenCalledWith(actor, organizationId, {
      limit: 10,
      analysis_type: 'stay_heatmap',
      status: 'completed',
      floor_id: floorId,
    })
  })

  it('不正な一覧queryを400で拒否する', async () => {
    const response = await createApp().request(
      `/api/organizations/${organizationId}/analysis-runs?limit=0`
    )

    expect(response.status).toBe(400)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('run詳細とtrajectoryの削除状態を返す', async () => {
    mocks.get.mockResolvedValue({
      ok: true,
      value: {
        ...runSummary,
        trajectories: [{ trajectory_id: trajectoryId, seq: 0, deleted: false }],
        started_at: '2026-08-04T00:00:00.000Z',
        deadline_at: '2026-08-04T01:00:00.000Z',
      },
    })
    const response = await createApp().request(
      `/api/organizations/${organizationId}/analysis-runs/${analysisRunId}`
    )

    expect(response.status).toBe(200)
    expect(mocks.get).toHaveBeenCalledWith(actor, organizationId, analysisRunId)
    await expect(response.json()).resolves.toMatchObject({
      analysis_run_id: analysisRunId,
      trajectories: [{ trajectory_id: trajectoryId, seq: 0, deleted: false }],
    })
  })

  it('存在しないrun詳細を404で返す', async () => {
    mocks.get.mockResolvedValue({ ok: false, error: { type: 'ANALYSIS_RUN_NOT_FOUND' } })
    const response = await createApp().request(
      `/api/organizations/${organizationId}/analysis-runs/${analysisRunId}`
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ANALYSIS_RUN_NOT_FOUND',
      error_message: 'analysis run not found',
    })
  })

  it('completed runのヒートマップ結果を返す', async () => {
    mocks.getResult.mockResolvedValue({
      ok: true,
      value: {
        analysis_run_id: analysisRunId,
        analysis_type: 'stay_heatmap',
        status: 'completed',
        definition_version: 'original-v1',
        floor: { id: floorId, map_width_px: 100, map_height_px: 200, scale_m_per_px: 0.01 },
        parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
        grid: {
          column_count: 1,
          row_count: 2,
          cells: [
            {
              grid_column: 0,
              grid_row: 1,
              total_stay_cell_visit_count: 2,
              mean_stay_cell_visit_count: 2,
            },
          ],
        },
        trajectory_counts: { input: 1, included: 1, excluded_deleted: 0 },
        trajectory_csvs: [
          {
            trajectory_id: trajectoryId,
            download_url: 'https://storage.test/stay.csv',
            expires_at: '2026-08-04T00:15:00.000Z',
          },
        ],
      },
    })
    const response = await createApp().request(
      `/api/organizations/${organizationId}/analysis-runs/${analysisRunId}/result`
    )

    expect(response.status).toBe(200)
    expect(mocks.getResult).toHaveBeenCalledWith(actor, organizationId, analysisRunId)
    await expect(response.json()).resolves.toMatchObject({
      analysis_run_id: analysisRunId,
      grid: { cells: [{ total_stay_cell_visit_count: 2 }] },
      trajectory_csvs: [{ trajectory_id: trajectoryId }],
    })
  })

  it('failed runの結果取得を409で返す', async () => {
    mocks.getResult.mockResolvedValue({
      ok: false,
      error: {
        type: 'ANALYSIS_RESULT_NOT_READY',
        status: 'failed',
        errorCode: 'ANALYSIS_TIMEOUT',
      },
    })
    const response = await createApp().request(
      `/api/organizations/${organizationId}/analysis-runs/${analysisRunId}/result`
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ANALYSIS_TIMEOUT',
      error_message: 'analysis result is not available (failed)',
    })
  })
})
