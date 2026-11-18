import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createTrajectory } from './create-trajectory.js'

const mocks = vi.hoisted(() => ({ recording: vi.fn(), floor: vi.fn(), run: vi.fn() }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../services/recordings/index.js', () => ({ findRecordingById: mocks.recording }))
vi.mock('../../services/floor-maps/revisions.js', () => ({ findMapRevision: mocks.floor }))
vi.mock('../analysis-runs/create-positioning-analysis-run.js', () => ({
  createPositioningAnalysisRun: mocks.run,
}))

const actor: RequestActor = { type: 'service_client', name: 'shared_token' }
const recording = {
  id: 'recording',
  floor_id: 'floor',
  organization_id: 'org',
  floor_map_revision_id: 'v1',
  upload_status: 'ready',
  upload_targets: ['acce', 'gyro'],
  constraints: [
    { seq: 0, point_type: 'start', x: 10, y: 20, direction: 123 },
    { seq: 1, point_type: 'waypoint', x: 30, y: 40, relative_timestamp: 5 },
  ],
}

describe('createTrajectory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.recording.mockResolvedValue(recording)
    mocks.floor.mockResolvedValue({ id: 'v1', organization_id: 'org', scale: 0.01 })
    mocks.run.mockResolvedValue({ ok: true, value: { analysis_run_id: 'run' } })
  })
  it('旧レスポンスの軌跡IDと条件を、単一のPDR run作成へ渡す', async () => {
    const constraints = [
      { seq: 0, point_type: 'start' as const, x: 5, y: 6, direction: 90 },
      { seq: 1, point_type: 'waypoint' as const, x: 7, y: 8, relative_timestamp: 10 },
    ]
    const result = await createTrajectory(actor, { recordingId: 'recording' }, { constraints })
    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: expect.any(String),
        recording_id: 'recording',
        organization_id: 'org',
        status: 'processing',
      },
    })
    if (!result.ok) throw new Error('unexpected failure')
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(
      actor,
      'org',
      `trajectory:${result.value.trajectory_id}`,
      { recording_ids: ['recording'], pipeline_ids: ['pdr'], parameters_by_pipeline: {} },
      { trajectoryId: result.value.trajectory_id, constraints }
    )
    expect(mocks.floor).toHaveBeenCalledWith('floor', 'org', 'v1')
  })
  it('条件省略時は計測の開始点・方位・経由点を引き継ぐ', async () => {
    await createTrajectory(actor, { recordingId: 'recording' }, {})
    expect(mocks.run.mock.calls[0][4].constraints).toEqual(recording.constraints)
  })
  it('明示的な空条件を計測の条件で補完しない', async () => {
    await createTrajectory(actor, { recordingId: 'recording' }, { constraints: [] })
    expect(mocks.run.mock.calls[0][4].constraints).toEqual([])
  })
  it('版のない旧計測は初期版として解決する', async () => {
    mocks.recording.mockResolvedValue({ ...recording, floor_map_revision_id: undefined })
    await createTrajectory(actor, { recordingId: 'recording' }, { constraints: [] })
    expect(mocks.floor).toHaveBeenCalledWith('floor', 'org', undefined)
  })
  it.each([
    [undefined, 'RECORDING_NOT_FOUND'],
    [{ ...recording, upload_status: 'accepted' }, 'RECORDING_NOT_READY'],
    [{ ...recording, upload_targets: ['acce'] }, 'RECORDING_UPLOAD_TARGETS_INVALID'],
    [{ ...recording, constraints: 'invalid' }, 'RECORDING_CONSTRAINTS_INVALID'],
  ])('無効な計測は解析を実行しない (%s)', async (value, type) => {
    mocks.recording.mockResolvedValue(value)
    expect(await createTrajectory(actor, { recordingId: 'recording' }, {})).toMatchObject({
      ok: false,
      error: { type },
    })
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('地図がなければrunを作成しない', async () => {
    mocks.floor.mockResolvedValue(undefined)
    expect(await createTrajectory(actor, { recordingId: 'recording' }, {})).toMatchObject({
      ok: false,
      error: { type: 'FLOOR_NOT_FOUND' },
    })
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('準備失敗は旧APIのエラーを返し、別経路で再実行しない', async () => {
    mocks.run.mockResolvedValue({ ok: false, error: { type: 'NOZOMI_UNAVAILABLE' } })
    expect(await createTrajectory(actor, { recordingId: 'recording' }, {})).toMatchObject({
      ok: false,
      error: { type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED' },
    })
    expect(mocks.run).toHaveBeenCalledOnce()
  })
})
