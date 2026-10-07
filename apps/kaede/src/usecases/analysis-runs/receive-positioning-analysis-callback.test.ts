import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import { receivePositioningAnalysisCallback } from './receive-positioning-analysis-callback.js'

const mocks = vi.hoisted(() => ({
  findCallback: vi.fn(),
  insertCallback: vi.fn(),
  findItem: vi.fn(),
  updateItem: vi.fn(),
}))

vi.mock('../../services/analysis-runs/positioning-analysis-callback-repository.js', () => ({
  findPositioningCallbackByEventId: mocks.findCallback,
  insertPositioningCallback: mocks.insertCallback,
  findPositioningRunItemById: mocks.findItem,
  updatePositioningRunItemState: mocks.updateItem,
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

describe('receivePositioningAnalysisCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCallback.mockResolvedValue(null)
    mocks.findItem.mockResolvedValue({
      id: itemId,
      status: 'processing',
      analysis_run_id: '33333333-3333-4333-8333-333333333333',
    })
    mocks.insertCallback.mockResolvedValue({ id: 'cb-1' })
    mocks.updateItem.mockResolvedValue({})
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

  it('新規イベントを受け取った場合、コールバックを受信箱に保存して 200 accepted を返す', async () => {
    const payload: PositioningAnalysisCallbackRequest = {
      event_id: 'event-1',
      analysis_run_item_id: itemId,
      status: 'completed',
      outputs: { trajectory_geojson: {} },
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
    expect(mocks.updateItem).toHaveBeenCalledOnce()
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
