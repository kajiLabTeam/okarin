import type { RequestActor } from '../../middleware/request-actor-context.js'
import {
  findPositioningRun,
  listPositioningItems,
} from '../../services/analysis-runs/positioning-analysis-run-repository.js'
import { requireOrganizationManager } from '../authorization.js'

export const getPositioningAnalysisRun = async (
  actor: RequestActor,
  organizationId: string,
  id: string
) => {
  const auth = requireOrganizationManager(actor, organizationId)
  if (!auth.ok) return { ok: false as const, error: auth.error }
  const run = await findPositioningRun(organizationId, id)
  if (!run) return { ok: false as const, error: { type: 'ANALYSIS_RUN_NOT_FOUND' as const } }
  const items = await listPositioningItems(run.id)
  const progress = { total: items.length, queued: 0, processing: 0, completed: 0, failed: 0 }
  for (const item of items) progress[item.status as keyof typeof progress]++
  const status = (
    progress.failed === progress.total
      ? 'failed'
      : progress.completed === progress.total
        ? 'completed'
        : progress.completed > 0 || progress.failed > 0
          ? 'partially_completed'
          : run.status
  ) as 'accepted' | 'processing' | 'completed' | 'partially_completed' | 'failed'
  return {
    ok: true as const,
    value: {
      analysis_run_id: run.id,
      status,
      progress,
      items: items.map((item) => ({
        id: item.id,
        recording_id: item.recording_id,
        pipeline_id: item.pipeline_id,
        status: item.status as 'queued' | 'processing' | 'completed' | 'failed',
        result_trajectory_id: item.result_trajectory_id,
        pipeline_digest: item.pipeline_digest,
        pipeline_version: item.pipeline_version,
        error: item.error as Record<string, unknown> | null,
      })),
    },
  }
}
