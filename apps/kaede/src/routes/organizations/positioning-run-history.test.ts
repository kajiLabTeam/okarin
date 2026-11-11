import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerPositioningAnalysisRunRoutes } from './positioning-analysis-runs.js'
const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../usecases/analysis-runs/list-positioning-analysis-runs.js', () => ({
  listPositioningAnalysisRuns: list,
}))
vi.mock('../../usecases/analysis-runs/create-positioning-analysis-run.js', () => ({
  createPositioningAnalysisRun: vi.fn(),
}))
vi.mock('../../usecases/analysis-runs/get-positioning-analysis-run.js', () => ({
  getPositioningAnalysisRun: vi.fn(),
}))
const actor: RequestActor = { type: 'service_client', name: 'shared_token' }
const org = '11111111-1111-4111-8111-111111111111'
const url = `/api/organizations/${org}/positioning-analysis-runs`
beforeEach(() => vi.clearAllMocks())
describe('GET positioning analysis history', () => {
  it('組織・フィルター・ページ情報を渡す', async () => {
    const value = {
      analysis_runs: [],
      in_progress_count: 0,
      pagination: { next_cursor: null, total_count: 0 },
    }
    list.mockResolvedValue({ ok: true, value })
    const app = createRouteTestApp('/organizations', registerPositioningAnalysisRunRoutes, {
      actor,
    })
    const response = await app.request(`${url}?filter=in_progress&limit=15`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(value)
    expect(list).toHaveBeenCalledWith(actor, org, { filter: 'in_progress', limit: 15 })
  })
  it.each(['filter=invalid', 'limit=101', 'limit=-1'])(
    '不正なクエリを拒否する (%s)',
    async (query) => {
      const app = createRouteTestApp('/organizations', registerPositioningAnalysisRunRoutes, {
        actor,
      })
      expect((await app.request(`${url}?${query}`)).status).toBe(400)
      expect(list).not.toHaveBeenCalled()
    }
  )
  it.each([
    ['PAGINATION_CURSOR_INVALID', 400],
    ['AUTH_ORGANIZATION_FORBIDDEN', 403],
  ] as const)('%sを%sで返す', async (type, status) => {
    list.mockResolvedValue({ ok: false, error: { type } })
    const app = createRouteTestApp('/organizations', registerPositioningAnalysisRunRoutes, {
      actor,
    })
    expect((await app.request(url)).status).toBe(status)
  })
})
