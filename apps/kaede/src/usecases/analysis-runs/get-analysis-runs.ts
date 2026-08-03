import type { RequestActor } from '../../middleware/request-actor-context.js'
import {
  stayHeatmapArtifactSchema,
  stayHeatmapParametersSchema,
} from '../../schemas/analysis-runs.js'
import type { ListAnalysisRunsQuery } from '../../schemas/analysis-runs.js'
import { buildPaginatedResult, decodePaginationCursor } from '../../schemas/pagination.js'
import {
  expireTimedOutAnalysisRuns,
  findOrganizationAnalysisRunById,
  listAnalysisRunTrajectoryStates,
  listOrganizationAnalysisRuns,
} from '../../services/analysis-runs/index.js'
import {
  getAnalysisHeatmapObjectText,
  issueAnalysisTrajectoryCsvDownloadUrl,
} from '../../services/storage/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

type ReadError =
  | AuthorizationError
  | { type: 'PAGINATION_CURSOR_INVALID' }
  | { type: 'ANALYSIS_RUN_NOT_FOUND' }
  | { type: 'ANALYSIS_RESULT_NOT_READY'; status: string; errorCode: string | null }
  | { type: 'ANALYSIS_RESULT_INVALID' }

const errorMessage = (code: string) => {
  const messages: Record<string, string> = {
    INVALID_TRAJECTORY_CSV: 'Trajectory data is invalid.',
    ANALYSIS_TIMEOUT: 'Analysis did not complete within the time limit.',
  }
  return messages[code] ?? 'Analysis processing failed.'
}

const serializeRun = async (run: Awaited<ReturnType<typeof findOrganizationAnalysisRunById>>) => {
  if (!run) throw new Error('analysis run is required')
  const trajectories = await listAnalysisRunTrajectoryStates(run.id)
  const included = trajectories.filter((trajectory) => !trajectory.deleted).length
  return {
    analysis_run_id: run.id,
    analysis_type: run.analysis_type,
    status: run.status as 'accepted' | 'processing' | 'completed' | 'failed',
    floor_id: run.floor_id,
    parameters: stayHeatmapParametersSchema.parse(run.parameters),
    definition_version: run.definition_version,
    trajectory_counts: {
      input: trajectories.length,
      included,
      excluded_deleted: trajectories.length - included,
    },
    error: run.error_code ? { code: run.error_code, message: errorMessage(run.error_code) } : null,
    created_at: run.created_at.toISOString(),
    updated_at: run.updated_at.toISOString(),
    finished_at: run.finished_at?.toISOString() ?? null,
    started_at: run.started_at?.toISOString() ?? null,
    deadline_at: run.deadline_at.toISOString(),
    trajectories: trajectories.map(({ trajectory_id, seq, deleted }) => ({
      trajectory_id,
      seq,
      deleted,
    })),
  }
}

const authorize = (actor: RequestActor, organizationId: string) =>
  requireOrganizationManager(actor, organizationId)

export const listAnalysisRuns = async (
  actor: RequestActor,
  organizationId: string,
  query: ListAnalysisRunsQuery
) => {
  const authorization = authorize(actor, organizationId)
  if (!authorization.ok) return authorization
  const cursor = query.cursor
    ? decodePaginationCursor(query.cursor)
    : { ok: true as const, value: null }
  if (!cursor.ok) return cursor

  await expireTimedOutAnalysisRuns()
  const page = await listOrganizationAnalysisRuns(organizationId, {
    limit: query.limit,
    cursor: cursor.value,
    analysisType: query.analysis_type,
    status: query.status,
    floorId: query.floor_id,
  })
  const paginated = buildPaginatedResult(page.rows, query.limit, page.totalCount)
  const items = await Promise.all(paginated.items.map((run) => serializeRun(run)))
  return {
    ok: true as const,
    value: {
      analysis_runs: items.map(
        ({ trajectories: _, started_at: __, deadline_at: ___, ...run }) => run
      ),
      pagination: { next_cursor: paginated.nextCursor, total_count: paginated.totalCount },
    },
  }
}

export const getAnalysisRun = async (
  actor: RequestActor,
  organizationId: string,
  analysisRunId: string
) => {
  const authorization = authorize(actor, organizationId)
  if (!authorization.ok) return authorization
  await expireTimedOutAnalysisRuns()
  const run = await findOrganizationAnalysisRunById(organizationId, analysisRunId)
  if (!run) return { ok: false as const, error: { type: 'ANALYSIS_RUN_NOT_FOUND' as const } }
  return { ok: true as const, value: await serializeRun(run) }
}

export const getAnalysisRunResult = async (
  actor: RequestActor,
  organizationId: string,
  analysisRunId: string
) => {
  const authorization = authorize(actor, organizationId)
  if (!authorization.ok) return authorization
  await expireTimedOutAnalysisRuns()
  const run = await findOrganizationAnalysisRunById(organizationId, analysisRunId)
  if (!run) return { ok: false as const, error: { type: 'ANALYSIS_RUN_NOT_FOUND' as const } }
  if (run.status !== 'completed') {
    return {
      ok: false as const,
      error: {
        type: 'ANALYSIS_RESULT_NOT_READY' as const,
        status: run.status,
        errorCode: run.error_code,
      },
    }
  }

  const [text, trajectories] = await Promise.all([
    getAnalysisHeatmapObjectText(organizationId, analysisRunId),
    listAnalysisRunTrajectoryStates(analysisRunId),
  ])
  let artifact: ReturnType<typeof stayHeatmapArtifactSchema.safeParse> | undefined
  try {
    artifact = text ? stayHeatmapArtifactSchema.safeParse(JSON.parse(text)) : undefined
  } catch {
    artifact = undefined
  }
  if (!artifact?.success) {
    return { ok: false as const, error: { type: 'ANALYSIS_RESULT_INVALID' as const } }
  }
  const activeIds = new Set(
    trajectories
      .filter((trajectory) => !trajectory.deleted)
      .map((trajectory) => trajectory.trajectory_id)
  )
  const totals = new Map<string, { grid_column: number; grid_row: number; total: number }>()
  for (const trajectory of artifact.data.trajectories) {
    if (!activeIds.has(trajectory.trajectory_id)) continue
    for (const cell of trajectory.cells) {
      const key = `${cell.grid_row}:${cell.grid_column}`
      const current = totals.get(key)
      totals.set(key, {
        grid_column: cell.grid_column,
        grid_row: cell.grid_row,
        total: (current?.total ?? 0) + cell.stay_cell_visit_count,
      })
    }
  }
  const trajectoryCsvs = await Promise.all(
    trajectories
      .filter((trajectory) => !trajectory.deleted)
      .map(async (trajectory) => {
        const signed = await issueAnalysisTrajectoryCsvDownloadUrl(
          organizationId,
          analysisRunId,
          trajectory.trajectory_id
        )
        return {
          trajectory_id: trajectory.trajectory_id,
          download_url: signed.downloadUrl,
          expires_at: signed.expiresAt,
        }
      })
  )
  const included = activeIds.size
  const cells = [...totals.values()]
    .sort((a, b) => a.grid_row - b.grid_row || a.grid_column - b.grid_column)
    .map(({ total, ...cell }) => ({
      ...cell,
      total_stay_cell_visit_count: total,
      mean_stay_cell_visit_count: Math.round((total / included) * 1_000_000) / 1_000_000,
    }))

  return {
    ok: true as const,
    value: {
      analysis_run_id: run.id,
      analysis_type: 'stay_heatmap' as const,
      status: 'completed' as const,
      definition_version: run.definition_version,
      floor: {
        id: run.floor_id,
        map_width_px: artifact.data.floor_map.width_px,
        map_height_px: artifact.data.floor_map.height_px,
        scale_m_per_px: artifact.data.floor_map.scale_m_per_px,
      },
      parameters: stayHeatmapParametersSchema.parse(run.parameters),
      grid: {
        column_count: artifact.data.grid.column_count,
        row_count: artifact.data.grid.row_count,
        cells: included === 0 ? [] : cells,
      },
      trajectory_counts: {
        input: trajectories.length,
        included,
        excluded_deleted: trajectories.length - included,
      },
      trajectory_csvs: trajectoryCsvs,
    },
  }
}

export type AnalysisRunReadError = ReadError
