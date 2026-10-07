import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import { receivePositioningAnalysisCallback } from './receive-positioning-analysis-callback.js'

const mocks = vi.hoisted(() => ({
  findCallback: vi.fn(),
  insertCallback: vi.fn(),
  findItem: vi.fn(),
  updateItem: vi.fn(),
  findRecording: vi.fn(),
  insertTrajectory: vi.fn(),
  aggregateRunStatus: vi.fn(),
}))

vi.mock('../../services/analysis-runs/positioning-analysis-callback-repository.js', () => ({
  findPositioningCallbackByEventId: mocks.findCallback,
  insertPositioningCallback: mocks.insertCallback,
  findPositioningRunItemById: mocks.findItem,
  updatePositioningRunItemState: mocks.updateItem,
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingById: mocks.findRecording,
}))

vi.mock('../../services/trajectories/index.js', () => ({
  insertTrajectory: mocks.insertTrajectory,
}))

vi.mock('../../services/analysis-runs/outbox-worker.js', () => ({
  aggregatePositioningRunStatus: mocks.aggregateRunStatus,
}))

vi.mock('../../services/db/index.js', () => ({
  db: {
    transaction: () => ({
      execute: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    }),
  },
}))

const serviceActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const userActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const itemId = '22222222-2222-4222-8222-222222222222'
const recordingId = '44444444-4444-4444-8444-444444444444'

describe('receivePositioningAnalysisCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCallback.mockResolvedValue(null)
    mocks.findItem.mockResolvedValue({
      id: itemId,
      recording_id: recordingId,
      status: 'processing',
      analysis_run_id: '33333333-3333-4333-8333-333333333333',
    })
    mocks.findRecording.mockResolvedValue({
      id: recordingId,
      organization_id: 'org-1',
      floor_id: 'floor-1',
    })
    mocks.insertTrajectory.mockImplementation((input: { id?: string }) =>
      Promise.resolve({ id: input.id ?? itemId })
    )
    mocks.insertCallback.mockResolvedValue({ id: 'cb-1' })
    mocks.updateItem.mockResolvedValue({})
    mocks.aggregateRunStatus.mockResolvedValue(undefined)
  })

  it('service_client 以外の actor からのリクエストは 401 UNAUTHORIZED を返す', async () => {
    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-1',
      analysis_run_item_id: itemId,
      status: 'completed',
    }

    const result = await receivePositioningAnalysisCallback(userActor, payload)
    expect(result).toEqual({
      ok: false,
      error: {
        type: 'UNAUTHORIZED',
        status: 401,
        message: 'service client authorization is required for internal callbacks',
      },
    })
  })

  it('completedイベント受信時に軌跡レコードを作成・紐付けし、親状態を集約する', async () => {
    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-1',
      analysis_run_item_id: itemId,
      status: 'completed',
      outputs: { trajectory_csv: 'http://s3/output.csv' },
    }

    const result = await receivePositioningAnalysisCallback(serviceActor, payload)
    expect(result).toEqual({
      ok: true,
      value: {
        event_id: 'event-1',
        status: 'accepted',
      },
    })
    expect(mocks.insertCallback).toHaveBeenCalledOnce()
    expect(mocks.insertTrajectory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: itemId,
        organization_id: 'org-1',
        recording_id: recordingId,
        floor_id: 'floor-1',
        status: 'completed',
      }),
      expect.anything()
    )
    expect(mocks.updateItem).toHaveBeenCalledWith(
      itemId,
      expect.objectContaining({
        status: 'completed',
        result_trajectory_id: itemId,
        error: null,
      }),
      expect.anything()
    )
    expect(mocks.aggregateRunStatus).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.anything()
    )
  })

  it('failedイベント受信時にエラーを記録して親状態を集約する', async () => {
    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-fail',
      analysis_run_item_id: itemId,
      status: 'failed',
      error: { code: 'ALGORITHM_ERROR', message: 'diverged' },
    }

    const result = await receivePositioningAnalysisCallback(serviceActor, payload)
    expect(result).toEqual({
      ok: true,
      value: {
        event_id: 'event-fail',
        status: 'accepted',
      },
    })
    expect(mocks.insertTrajectory).not.toHaveBeenCalled()
    expect(mocks.updateItem).toHaveBeenCalledWith(
      itemId,
      expect.objectContaining({
        status: 'failed',
        result_trajectory_id: null,
        error: { code: 'ALGORITHM_ERROR', message: 'diverged' },
      }),
      expect.anything()
    )
    expect(mocks.aggregateRunStatus).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.anything()
    )
  })

  it('既に処理済みの event_id の場合は冪等に already_processed を返す', async () => {
    mocks.findCallback.mockResolvedValue({
      id: 'cb-1',
      event_id: 'event-dup',
      analysis_run_item_id: itemId,
      status: 'completed',
    })

    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-dup',
      analysis_run_item_id: itemId,
      status: 'completed',
    }

    const result = await receivePositioningAnalysisCallback(serviceActor, payload)
    expect(result).toEqual({
      ok: true,
      value: {
        event_id: 'event-dup',
        status: 'already_processed',
      },
    })
    expect(mocks.insertCallback).not.toHaveBeenCalled()
    expect(mocks.updateItem).not.toHaveBeenCalled()
  })

  it('並行受信でON CONFLICTによりinsertがスキップされた場合も already_processed を返す', async () => {
    mocks.findCallback.mockResolvedValue(null)
    mocks.insertCallback.mockResolvedValue(null) // ON CONFLICT DO NOTHING

    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-concurrent-dup',
      analysis_run_item_id: itemId,
      status: 'completed',
    }

    const result = await receivePositioningAnalysisCallback(serviceActor, payload)
    expect(result).toEqual({
      ok: true,
      value: {
        event_id: 'event-concurrent-dup',
        status: 'already_processed',
      },
    })
  })

  it('対象の analysis_run_item が存在しない場合は 404 RUN_ITEM_NOT_FOUND を返す', async () => {
    mocks.findItem.mockResolvedValue(null)

    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-unknown',
      analysis_run_item_id: itemId,
      status: 'completed',
    }

    const result = await receivePositioningAnalysisCallback(serviceActor, payload)
    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RUN_ITEM_NOT_FOUND',
        status: 404,
        message: `analysis run item ${itemId} not found`,
      },
    })
  })
})
