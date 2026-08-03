import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerAnalysisCallbackRoute } from './callback.js'

const { receiveCallbackMock } = vi.hoisted(() => ({ receiveCallbackMock: vi.fn() }))

vi.mock('../../usecases/analysis-runs/receive-callback.js', () => ({
  receiveAnalysisCallback: receiveCallbackMock,
}))

const runId = '11111111-1111-4111-8111-111111111111'

describe('POST /api/analysis-runs/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completed callbackを受理する', async () => {
    receiveCallbackMock.mockResolvedValue({
      ok: true,
      value: { analysis_run_id: runId, status: 'completed' },
    })
    const app = createRouteTestApp('/analysis-runs', registerAnalysisCallbackRoute)
    const response = await app.request('/api/analysis-runs/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        analysis_run_id: runId,
        status: 'completed',
        callback_token: 'token',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ analysis_run_id: runId, status: 'completed' })
  })

  it('不正tokenは401を返す', async () => {
    receiveCallbackMock.mockResolvedValue({
      ok: false,
      error: { type: 'CALLBACK_TOKEN_INVALID' },
    })
    const app = createRouteTestApp('/analysis-runs', registerAnalysisCallbackRoute)
    const response = await app.request('/api/analysis-runs/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        analysis_run_id: runId,
        status: 'completed',
        callback_token: 'invalid',
      }),
    })

    expect(response.status).toBe(401)
  })

  it('未知fieldを含むpayloadは400を返す', async () => {
    const app = createRouteTestApp('/analysis-runs', registerAnalysisCallbackRoute)
    const response = await app.request('/api/analysis-runs/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        analysis_run_id: runId,
        status: 'completed',
        callback_token: 'token',
        unknown: true,
      }),
    })

    expect(response.status).toBe(400)
    expect(receiveCallbackMock).not.toHaveBeenCalled()
  })
})
