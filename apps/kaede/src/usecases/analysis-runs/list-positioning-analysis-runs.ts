import type { RequestActor } from '../../middleware/request-actor-context.js'
import { buildPaginatedResult, decodePaginationCursor } from '../../schemas/pagination.js'
import type { PositioningAnalysisRunListQuery } from '../../schemas/positioning-analysis-runs.js'
import { listOrganizationPositioningRuns } from '../../services/analysis-runs/positioning-analysis-run-repository.js'
import { positioningRunStatus } from '../../services/analysis-runs/positioning-run-progress.js'
import { requireOrganizationManager } from '../authorization.js'

export const listPositioningAnalysisRuns = async (
  actor: RequestActor,
  organizationId: string,
  query: PositioningAnalysisRunListQuery
) => {
  const auth = requireOrganizationManager(actor, organizationId)
  if (!auth.ok) return auth
  const cursor = query.cursor
    ? decodePaginationCursor(query.cursor)
    : { ok: true as const, value: null }
  if (!cursor.ok) return cursor
  const result = await listOrganizationPositioningRuns(organizationId, {
    limit: query.limit,
    cursor: cursor.value,
    filter: query.filter,
  })
  const page = buildPaginatedResult(result.rows, query.limit, result.totalCount)
  return {
    ok: true as const,
    value: {
      analysis_runs: page.items.map((row) => {
        const progress = {
          total: row.total,
          queued: row.queued,
          processing: row.processing,
          completed: row.completed,
          failed: row.failed,
        }
        return {
          analysis_run_id: row.id,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
          status: positioningRunStatus(progress, row.status),
          recording_count: row.recording_count,
          pipeline_ids: row.pipeline_ids,
          progress,
          video_progress: { processing: row.video_processing, failed: row.video_failed },
        }
      }),
      in_progress_count: result.inProgressCount,
      pagination: { next_cursor: page.nextCursor, total_count: page.totalCount },
    },
  }
}
