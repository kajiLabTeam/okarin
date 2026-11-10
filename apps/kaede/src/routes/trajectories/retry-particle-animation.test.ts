import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerRetryParticleAnimationRoute } from './retry-particle-animation.js'
const { retry } = vi.hoisted(() => ({ retry: vi.fn() }))
vi.mock('../../usecases/trajectories/retry-particle-animation.js', () => ({
  retryParticleAnimation: retry,
}))
const actor: RequestActor = { type: 'service_client', name: 'shared_token' }
const trajectoryId = '22222222-2222-4222-8222-222222222222'
beforeEach(() => vi.clearAllMocks())
describe('POST /api/trajectories/:trajectoryId/particle-animation/retry', () => {
  it('動画再生成の受付を202で返す', async () => {
    const value = {
      trajectory_id: trajectoryId,
      generation_status: 'processing',
      generation_attempt: 1,
    }
    retry.mockResolvedValue({ ok: true, value })
    const app = createRouteTestApp('/trajectories', registerRetryParticleAnimationRoute, { actor })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/particle-animation/retry`,
      { method: 'POST' }
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual(value)
    expect(retry).toHaveBeenCalledWith(actor, trajectoryId)
  })
  it.each([403, 404, 409, 502])('拒否・失敗を%sで返す', async (status) => {
    retry.mockResolvedValue({ ok: false, status, message: '再生成できません。' })
    const app = createRouteTestApp('/trajectories', registerRetryParticleAnimationRoute, { actor })
    const response = await app.request(
      `/api/trajectories/${trajectoryId}/particle-animation/retry`,
      { method: 'POST' }
    )
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({
      error_code: 'VIDEO_RETRY_REJECTED',
      error_message: '再生成できません。',
    })
  })
  it('不正な軌跡IDはリクエストを実行しない', async () => {
    const app = createRouteTestApp('/trajectories', registerRetryParticleAnimationRoute, { actor })
    const response = await app.request('/api/trajectories/invalid/particle-animation/retry', {
      method: 'POST',
    })
    expect(response.status).toBe(400)
    expect(retry).not.toHaveBeenCalled()
  })
})
