import * as Sentry from '@sentry/node'
import { getCallbackRuntimeConfig } from '../../config/runtime.js'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { CreateStayHeatmapRequest } from '../../schemas/analysis-runs.js'
import { trajectoryConstraintsSchema } from '../../schemas/trajectories.js'
import {
  insertAnalysisRun,
  insertAnalysisRunTrajectories,
  markAnalysisRunFailed,
  markAnalysisRunProcessing,
} from '../../services/analysis-runs/index.js'
import { db } from '../../services/db/index.js'
import { findFloorById } from '../../services/floors/index.js'
import { submitStayHeatmapAnalyzeRequest } from '../../services/nozomi/index.js'
import {
  issueInternalAnalysisHeatmapUploadUrl,
  issueInternalAnalysisTrajectoryDownloadUrl,
  issueInternalAnalysisTrajectoryUploadUrl,
} from '../../services/storage/index.js'
import { generateAnalysisCallbackToken } from '../../services/trajectories/callback-token.js'
import { findTrajectoryById } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

type ValidationError =
  | { type: 'TRAJECTORY_NOT_FOUND'; trajectoryId: string }
  | { type: 'TRAJECTORY_NOT_COMPLETED'; trajectoryId: string }
  | { type: 'TRAJECTORY_SCOPE_INVALID'; trajectoryId: string }
  | { type: 'TRAJECTORY_START_INVALID'; trajectoryId: string }
  | { type: 'FLOOR_NOT_FOUND'; floorId: string }
  | { type: 'FLOOR_ANALYSIS_METADATA_INVALID'; floorId: string }

export type CreateStayHeatmapResult =
  | { ok: true; value: { analysis_run_id: string; status: 'processing' } }
  | { ok: false; error: AuthorizationError | ValidationError }
  | {
      ok: false
      error: {
        type: 'ANALYSIS_PREPARATION_FAILED' | 'NOZOMI_REQUEST_FAILED'
        analysisRunId: string
      }
    }

const callbackUrl = () => `${getCallbackRuntimeConfig().baseUrl}/api/analysis-runs/callback`

export const createStayHeatmap = async (
  actor: RequestActor,
  organizationId: string,
  payload: CreateStayHeatmapRequest
): Promise<CreateStayHeatmapResult> => {
  const authorization = requireOrganizationManager(actor, organizationId)
  if (!authorization.ok) return authorization

  const trajectories = await Promise.all(
    payload.trajectory_ids.map((trajectoryId) => findTrajectoryById(trajectoryId))
  )
  const validatedTrajectories = []
  for (const [index, trajectory] of trajectories.entries()) {
    if (!trajectory) {
      return {
        ok: false,
        error: { type: 'TRAJECTORY_NOT_FOUND', trajectoryId: payload.trajectory_ids[index] },
      }
    }
    if (trajectory.status !== 'completed') {
      return { ok: false, error: { type: 'TRAJECTORY_NOT_COMPLETED', trajectoryId: trajectory.id } }
    }
    validatedTrajectories.push(trajectory)
  }

  const first = validatedTrajectories[0]
  for (const trajectory of validatedTrajectories) {
    if (trajectory.organization_id !== organizationId || trajectory.floor_id !== first.floor_id) {
      return { ok: false, error: { type: 'TRAJECTORY_SCOPE_INVALID', trajectoryId: trajectory.id } }
    }
  }

  const floor = await findFloorById(first.floor_id)
  if (floor?.organization_id !== organizationId) {
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId: first.floor_id } }
  }
  if (
    floor.scale === null ||
    floor.scale <= 0 ||
    floor.map_width_px === null ||
    floor.map_width_px <= 0 ||
    floor.map_height_px === null ||
    floor.map_height_px <= 0
  ) {
    return {
      ok: false,
      error: { type: 'FLOOR_ANALYSIS_METADATA_INVALID', floorId: floor.id },
    }
  }

  const preparedTrajectories: {
    trajectory: (typeof validatedTrajectories)[number]
    seq: number
    start: { x: number; y: number }
  }[] = []
  for (const [seq, trajectory] of validatedTrajectories.entries()) {
    const constraints = trajectoryConstraintsSchema.safeParse(trajectory.constraints)
    const start = constraints.success
      ? constraints.data.find((constraint) => constraint.point_type === 'start')
      : undefined
    if (
      !start ||
      start.x < 0 ||
      start.y < 0 ||
      start.x >= floor.map_width_px ||
      start.y >= floor.map_height_px
    ) {
      return { ok: false, error: { type: 'TRAJECTORY_START_INVALID', trajectoryId: trajectory.id } }
    }
    preparedTrajectories.push({ trajectory, seq, start })
  }

  const processing = await db.transaction().execute(async (transaction) => {
    const run = await insertAnalysisRun(
      {
        organization_id: organizationId,
        floor_id: floor.id,
        analysis_type: 'stay_heatmap',
        parameters: payload.parameters,
        definition_version: 'original-v1',
      },
      transaction
    )
    await insertAnalysisRunTrajectories(
      preparedTrajectories.map(({ trajectory, seq }) => ({
        analysis_run_id: run.id,
        trajectory_id: trajectory.id,
        seq,
      })),
      transaction
    )
    const updated = await markAnalysisRunProcessing(run.id, new Date(), transaction)
    if (!updated) throw new Error('failed to mark analysis run processing')
    return updated
  })

  let request: Parameters<typeof submitStayHeatmapAnalyzeRequest>[0]
  try {
    const [trajectoryUrls, heatmapOutput, token] = await Promise.all([
      Promise.all(
        preparedTrajectories.map(async ({ trajectory, seq, start }) => {
          const [source, output] = await Promise.all([
            issueInternalAnalysisTrajectoryDownloadUrl(organizationId, trajectory.id),
            issueInternalAnalysisTrajectoryUploadUrl(organizationId, processing.id, trajectory.id),
          ])
          return {
            trajectory_id: trajectory.id,
            seq,
            start: { x_px: start.x, y_px: start.y },
            source: { download_url: source.downloadUrl },
            output: { upload_url: output.uploadUrl },
          }
        })
      ),
      issueInternalAnalysisHeatmapUploadUrl(organizationId, processing.id),
      Promise.resolve(generateAnalysisCallbackToken(processing.id)),
    ])
    request = {
      analysis_run_id: processing.id,
      analysis_type: 'stay_heatmap',
      definition_version: 'original-v1',
      parameters: payload.parameters,
      floor: {
        floor_id: floor.id,
        map_width_px: floor.map_width_px,
        map_height_px: floor.map_height_px,
        scale_m_per_px: floor.scale,
      },
      trajectories: trajectoryUrls,
      heatmap_output: { upload_url: heatmapOutput.uploadUrl },
      callback: { url: callbackUrl(), token },
    }
  } catch (error) {
    Sentry.captureException(error)
    await markAnalysisRunFailed(processing.id, 'ANALYSIS_PREPARATION_FAILED')
    return {
      ok: false,
      error: { type: 'ANALYSIS_PREPARATION_FAILED', analysisRunId: processing.id },
    }
  }

  try {
    const accepted = await submitStayHeatmapAnalyzeRequest(request)
    if (accepted.analysis_run_id !== processing.id) throw new Error('unexpected analysis run id')
  } catch (error) {
    Sentry.captureException(error)
    await markAnalysisRunFailed(processing.id, 'NOZOMI_REQUEST_FAILED')
    return {
      ok: false,
      error: { type: 'NOZOMI_REQUEST_FAILED', analysisRunId: processing.id },
    }
  }

  return { ok: true, value: { analysis_run_id: processing.id, status: 'processing' } }
}
