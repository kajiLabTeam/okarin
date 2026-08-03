import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createStayHeatmap } from './create-stay-heatmap.js'

const mocks = vi.hoisted(() => ({
  findTrajectoryById: vi.fn(),
  findFloorById: vi.fn(),
  insertAnalysisRun: vi.fn(),
  insertInputs: vi.fn(),
  markProcessing: vi.fn(),
  markFailed: vi.fn(),
  sourceUrl: vi.fn(),
  outputUrl: vi.fn(),
  heatmapUrl: vi.fn(),
  callbackToken: vi.fn(),
  submit: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('../../services/db/index.js', () => ({
  db: { transaction: () => ({ execute: mocks.transaction }) },
}))
vi.mock('../../services/analysis-runs/index.js', () => ({
  insertAnalysisRun: mocks.insertAnalysisRun,
  insertAnalysisRunTrajectories: mocks.insertInputs,
  markAnalysisRunProcessing: mocks.markProcessing,
  markAnalysisRunFailed: mocks.markFailed,
}))
vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: mocks.findTrajectoryById,
}))
vi.mock('../../services/trajectories/callback-token.js', () => ({
  generateAnalysisCallbackToken: mocks.callbackToken,
}))
vi.mock('../../services/floors/index.js', () => ({ findFloorById: mocks.findFloorById }))
vi.mock('../../services/nozomi/index.js', () => ({
  submitStayHeatmapAnalyzeRequest: mocks.submit,
}))
vi.mock('../../services/storage/index.js', () => ({
  issueInternalAnalysisTrajectoryDownloadUrl: mocks.sourceUrl,
  issueInternalAnalysisTrajectoryUploadUrl: mocks.outputUrl,
  issueInternalAnalysisHeatmapUploadUrl: mocks.heatmapUrl,
}))
vi.mock('../../config/runtime.js', () => ({
  getCallbackRuntimeConfig: () => ({ baseUrl: 'https://kaede.test' }),
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const floorId = '22222222-2222-4222-8222-222222222222'
const trajectoryId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const actor: RequestActor = {
  type: 'user',
  user_id: '55555555-5555-4555-8555-555555555555',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Test', role: 'manager' }],
}

describe('createStayHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findTrajectoryById.mockResolvedValue({
      id: trajectoryId,
      organization_id: organizationId,
      floor_id: floorId,
      status: 'completed',
      constraints: [
        { seq: 0, point_type: 'start', x: 10, y: 20 },
        { seq: 1, point_type: 'goal', x: 30, y: 40 },
      ],
    })
    mocks.findFloorById.mockResolvedValue({
      id: floorId,
      organization_id: organizationId,
      scale: 0.01,
      map_width_px: 100,
      map_height_px: 200,
    })
    mocks.insertAnalysisRun.mockResolvedValue({ id: runId })
    mocks.insertInputs.mockResolvedValue([])
    mocks.markProcessing.mockResolvedValue({ id: runId })
    mocks.markFailed.mockResolvedValue({ id: runId, status: 'failed' })
    mocks.transaction.mockImplementation((callback) => callback({}))
    mocks.sourceUrl.mockResolvedValue({ downloadUrl: 'https://storage.test/input.csv' })
    mocks.outputUrl.mockResolvedValue({ uploadUrl: 'https://storage.test/stay.csv' })
    mocks.heatmapUrl.mockResolvedValue({ uploadUrl: 'https://storage.test/heatmap.json' })
    mocks.callbackToken.mockReturnValue('token')
    mocks.submit.mockResolvedValue({ analysis_run_id: runId, status: 'accepted' })
  })

  it('runを作成してNozomiへ滞在ヒートマップ分析を依頼する', async () => {
    const result = await createStayHeatmap(actor, organizationId, {
      trajectory_ids: [trajectoryId],
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
    })

    expect(result).toEqual({ ok: true, value: { analysis_run_id: runId, status: 'processing' } })
    expect(mocks.insertInputs).toHaveBeenCalledWith(
      [{ analysis_run_id: runId, trajectory_id: trajectoryId, seq: 0 }],
      {}
    )
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_run_id: runId,
        floor: {
          floor_id: floorId,
          map_width_px: 100,
          map_height_px: 200,
          scale_m_per_px: 0.01,
        },
        trajectories: [
          expect.objectContaining({
            trajectory_id: trajectoryId,
            seq: 0,
            start: { x_px: 10, y_px: 20 },
          }),
        ],
      })
    )
  })

  it('開始点が画像外の場合はrunを作成しない', async () => {
    mocks.findTrajectoryById.mockResolvedValueOnce({
      id: trajectoryId,
      organization_id: organizationId,
      floor_id: floorId,
      status: 'completed',
      constraints: [{ seq: 0, point_type: 'start', x: 100, y: 20 }],
    })

    const result = await createStayHeatmap(actor, organizationId, {
      trajectory_ids: [trajectoryId],
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'TRAJECTORY_START_INVALID', trajectoryId },
    })
    expect(mocks.insertAnalysisRun).not.toHaveBeenCalled()
  })

  it('Nozomi依頼失敗時はrunをfailedにする', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('nozomi unavailable'))

    const result = await createStayHeatmap(actor, organizationId, {
      trajectory_ids: [trajectoryId],
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'NOZOMI_REQUEST_FAILED', analysisRunId: runId },
    })
    expect(mocks.markFailed).toHaveBeenCalledWith(runId, 'NOZOMI_REQUEST_FAILED')
  })

  it('署名URLの準備失敗時はNozomiへ依頼せずrunをfailedにする', async () => {
    mocks.sourceUrl.mockRejectedValueOnce(new Error('storage unavailable'))

    const result = await createStayHeatmap(actor, organizationId, {
      trajectory_ids: [trajectoryId],
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'ANALYSIS_PREPARATION_FAILED', analysisRunId: runId },
    })
    expect(mocks.markFailed).toHaveBeenCalledWith(runId, 'ANALYSIS_PREPARATION_FAILED')
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
