import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import { receivePositioningAnalysisCallback } from '../../usecases/analysis-runs/receive-positioning-analysis-callback.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerPositioningAnalysisCallbackRoute } from './positioning-analysis-callbacks.js'

vi.mock('../../usecases/analysis-runs/receive-positioning-analysis-callback.js', () => ({
  receivePositioningAnalysisCallback: vi.fn(),
}))

const mockReceiveCallback = vi.mocked(receivePositioningAnalysisCallback)

const createTestApp = (actorType: 'service_client' | 'user') => {
  const actor: RequestActor =
    actorType === 'service_client'
      ? {
          type: 'service_client',
          name: 'shared_token',
        }
      : {
          type: 'user',
          user_id: '11111111-1111-4111-8111-111111111111',
          email: 'user@example.com',
          global_role: 'none',
          account_state: 'active',
          memberships: [],
        }

  return createRouteTestApp('/internal', registerPositioningAnalysisCallbackRoute, { actor })
}

describe('POST /pipeline-executions/callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validPayload: PositioningAnalysisCallbackRequest = {
    event_id: 'event-100',
    analysis_run_item_id: '22222222-2222-4222-8222-222222222222',
    status: 'completed',
    outputs: {
      trajectory_geojson: { type: 'FeatureCollection', features: [] },
    },
  }

  it('正常なコールバックを受け取り 200 OK を返す', async () => {
    mockReceiveCallback.mockResolvedValue({
      ok: true,
      value: {
        event_id: 'event-100',
        status: 'accepted',
      },
    })

    const app = createTestApp('service_client')
    const response = await app.request('/api/internal/pipeline-executions/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      event_id: 'event-100',
      status: 'accepted',
    })
  })

  it('認証エラーの場合は 401 を返す', async () => {
    mockReceiveCallback.mockResolvedValue({
      ok: false,
      error: {
        type: 'UNAUTHORIZED',
        status: 401,
        message: 'service client authorization is required for internal callbacks',
      },
    })

    const app = createTestApp('user')
    const response = await app.request('/api/internal/pipeline-executions/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error_code: 'UNAUTHORIZED',
      error_message: 'service client authorization is required for internal callbacks',
    })
  })

  it('アイテムが存在しない場合は 404 を返す', async () => {
    mockReceiveCallback.mockResolvedValue({
      ok: false,
      error: {
        type: 'RUN_ITEM_NOT_FOUND',
        status: 404,
        message: 'analysis run item not found',
      },
    })

    const app = createTestApp('service_client')
    const response = await app.request('/api/internal/pipeline-executions/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error_code: 'RUN_ITEM_NOT_FOUND',
      error_message: 'analysis run item not found',
    })
  })
})
