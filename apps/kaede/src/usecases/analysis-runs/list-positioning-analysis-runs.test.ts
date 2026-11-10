import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { listPositioningAnalysisRuns } from './list-positioning-analysis-runs.js'
const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../services/analysis-runs/positioning-analysis-run-repository.js', () => ({
  listOrganizationPositioningRuns: list,
}))
const actor: RequestActor = {
  type: 'user',
  user_id: 'user',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: 'org', organization_name: 'Org', role: 'manager' }],
}
beforeEach(() => {
  vi.clearAllMocks()
})
describe('listPositioningAnalysisRuns', () => {
  it('権限のない組織の一覧を取得しない', async () => {
    expect(
      await listPositioningAnalysisRuns(actor, 'other', { limit: 20, filter: 'all' })
    ).toMatchObject({ ok: false })
    expect(list).not.toHaveBeenCalled()
  })
  it('不正なcursorを拒否する', async () => {
    expect(
      await listPositioningAnalysisRuns(actor, 'org', {
        limit: 20,
        filter: 'all',
        cursor: 'invalid',
      })
    ).toMatchObject({ ok: false, error: { type: 'PAGINATION_CURSOR_INVALID' } })
    expect(list).not.toHaveBeenCalled()
  })
  it('親の状態が古くても、軌跡完了と動画生成中を分けて返す', async () => {
    list.mockResolvedValue({
      rows: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          status: 'accepted',
          created_at: new Date('2026-11-10T00:00:00Z'),
          updated_at: new Date('2026-11-10T00:01:00Z'),
          cursor_created_at: '2026-11-10T00:00:00.000000Z',
          recording_count: 1,
          pipeline_ids: ['pdr-particle-filter'],
          total: 1,
          completed: 1,
          failed: 0,
          queued: 0,
          processing: 0,
          video_processing: 1,
          video_failed: 0,
        },
      ],
      totalCount: 1,
      inProgressCount: 0,
    })
    const result = await listPositioningAnalysisRuns(actor, 'org', { limit: 20, filter: 'all' })
    expect(result).toMatchObject({
      ok: true,
      value: {
        in_progress_count: 0,
        analysis_runs: [
          {
            status: 'completed',
            progress: { total: 1, completed: 1 },
            video_progress: { processing: 1, failed: 0 },
          },
        ],
        pagination: { next_cursor: null, total_count: 1 },
      },
    })
    expect(list).toHaveBeenCalledWith('org', { limit: 20, cursor: null, filter: 'all' })
  })
})
