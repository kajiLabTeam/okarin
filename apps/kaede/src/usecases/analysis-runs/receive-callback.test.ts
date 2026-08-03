import { beforeEach, describe, expect, it, vi } from 'vitest'
import { receiveAnalysisCallback } from './receive-callback.js'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findRun: vi.fn(),
  listInputs: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  getHeatmap: vi.fn(),
  csvExists: vi.fn(),
}))

vi.mock('../../services/trajectories/callback-token.js', () => ({
  verifyAnalysisCallbackToken: mocks.verifyToken,
}))
vi.mock('../../services/analysis-runs/index.js', () => ({
  findAnalysisRunById: mocks.findRun,
  listAnalysisRunTrajectories: mocks.listInputs,
  markAnalysisRunCompleted: mocks.markCompleted,
  markAnalysisRunFailed: mocks.markFailed,
}))
vi.mock('../../services/storage/index.js', () => ({
  getAnalysisHeatmapObjectText: mocks.getHeatmap,
  doesAnalysisTrajectoryCsvObjectExist: mocks.csvExists,
}))

const runId = '11111111-1111-4111-8111-111111111111'
const organizationId = '22222222-2222-4222-8222-222222222222'
const trajectoryId = '33333333-3333-4333-8333-333333333333'
const now = new Date('2026-08-04T03:00:00.000Z')
const artifact = {
  schema_version: '1.0',
  definition_version: 'original-v1',
  parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
  floor_map: { width_px: 100, height_px: 200, scale_m_per_px: 0.01 },
  grid: { size_m: 1, column_count: 1, row_count: 2 },
  input_trajectory_count: 1,
  trajectories: [{ trajectory_id: trajectoryId, cells: [] }],
}

describe('receiveAnalysisCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyToken.mockReturnValue({
      ok: true,
      value: { analysisRunId: runId, analysisType: 'stay_heatmap', exp: 1 },
    })
    mocks.findRun.mockResolvedValue({
      id: runId,
      organization_id: organizationId,
      analysis_type: 'stay_heatmap',
      status: 'processing',
      error_code: null,
    })
    mocks.listInputs.mockResolvedValue([
      { analysis_run_id: runId, trajectory_id: trajectoryId, seq: 0 },
    ])
    mocks.getHeatmap.mockResolvedValue(JSON.stringify(artifact))
    mocks.csvExists.mockResolvedValue(true)
    mocks.markCompleted.mockResolvedValue({ id: runId, status: 'completed' })
    mocks.markFailed.mockResolvedValue({ id: runId, status: 'failed' })
  })

  it('成果物を検証してrunをcompletedにする', async () => {
    const result = await receiveAnalysisCallback(
      { analysis_run_id: runId, status: 'completed', callback_token: 'token' },
      now
    )

    expect(result).toEqual({ ok: true, value: { analysis_run_id: runId, status: 'completed' } })
    expect(mocks.markCompleted).toHaveBeenCalledWith(runId, now)
  })

  it('成果物のtrajectory集合が異なる場合はrunをfailedにする', async () => {
    mocks.getHeatmap.mockResolvedValueOnce(
      JSON.stringify({ ...artifact, trajectories: [], input_trajectory_count: 1 })
    )

    const result = await receiveAnalysisCallback(
      { analysis_run_id: runId, status: 'completed', callback_token: 'token' },
      now
    )

    expect(result).toEqual({ ok: false, error: { type: 'CALLBACK_ARTIFACT_INVALID' } })
    expect(mocks.markFailed).toHaveBeenCalledWith(runId, 'ARTIFACT_VALIDATION_FAILED', now)
  })

  it('未知の失敗codeを正規化してfailedにする', async () => {
    const result = await receiveAnalysisCallback(
      {
        analysis_run_id: runId,
        status: 'failed',
        callback_token: 'token',
        error_code: 'UNKNOWN',
        error_message: 'detail',
      },
      now
    )

    expect(result).toEqual({ ok: true, value: { analysis_run_id: runId, status: 'failed' } })
    expect(mocks.markFailed).toHaveBeenCalledWith(runId, 'ANALYSIS_PROCESSING_FAILED', now)
  })

  it('同じcompleted callbackの再送は成功する', async () => {
    mocks.findRun.mockResolvedValueOnce({ id: runId, status: 'completed' })

    const result = await receiveAnalysisCallback(
      { analysis_run_id: runId, status: 'completed', callback_token: 'token' },
      now
    )

    expect(result).toEqual({ ok: true, value: { analysis_run_id: runId, status: 'completed' } })
    expect(mocks.getHeatmap).not.toHaveBeenCalled()
  })

  it('不正tokenは401相当のerrorにする', async () => {
    mocks.verifyToken.mockReturnValueOnce({ ok: false, error: 'CALLBACK_TOKEN_INVALID' })

    const result = await receiveAnalysisCallback(
      { analysis_run_id: runId, status: 'completed', callback_token: 'invalid' },
      now
    )

    expect(result).toEqual({ ok: false, error: { type: 'CALLBACK_TOKEN_INVALID' } })
    expect(mocks.findRun).not.toHaveBeenCalled()
  })
})
