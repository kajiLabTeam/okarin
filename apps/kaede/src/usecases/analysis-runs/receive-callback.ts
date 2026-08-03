import type { AnalysisCallbackRequest } from '../../schemas/analysis-runs.js'
import { stayHeatmapArtifactSchema } from '../../schemas/analysis-runs.js'
import {
  findAnalysisRunById,
  listAnalysisRunTrajectories,
  markAnalysisRunCompleted,
  markAnalysisRunFailed,
} from '../../services/analysis-runs/index.js'
import {
  doesAnalysisTrajectoryCsvObjectExist,
  getAnalysisHeatmapObjectText,
} from '../../services/storage/index.js'
import { verifyAnalysisCallbackToken } from '../../services/trajectories/callback-token.js'

const nozomiErrorCodes = new Set([
  'TRAJECTORY_DOWNLOAD_FAILED',
  'INVALID_TRAJECTORY_CSV',
  'ANALYSIS_PROCESSING_FAILED',
  'ARTIFACT_UPLOAD_FAILED',
])

type CallbackError =
  | { type: 'CALLBACK_TOKEN_INVALID' | 'CALLBACK_TOKEN_EXPIRED' }
  | { type: 'ANALYSIS_RUN_NOT_FOUND' }
  | { type: 'CALLBACK_ANALYSIS_RUN_MISMATCH' }
  | { type: 'CALLBACK_ALREADY_FINALIZED' }
  | { type: 'CALLBACK_ARTIFACT_INVALID' }

export type ReceiveAnalysisCallbackResult =
  | { ok: true; value: { analysis_run_id: string; status: 'completed' | 'failed' } }
  | { ok: false; error: CallbackError }

const normalizedErrorCode = (code: string) =>
  nozomiErrorCodes.has(code) ? code : 'ANALYSIS_PROCESSING_FAILED'

export const receiveAnalysisCallback = async (
  payload: AnalysisCallbackRequest,
  now: Date = new Date()
): Promise<ReceiveAnalysisCallbackResult> => {
  const verified = verifyAnalysisCallbackToken(payload.callback_token, now)
  if (!verified.ok) return { ok: false, error: { type: verified.error } }
  if (verified.value.analysisRunId !== payload.analysis_run_id) {
    return { ok: false, error: { type: 'CALLBACK_ANALYSIS_RUN_MISMATCH' } }
  }

  const run = await findAnalysisRunById(payload.analysis_run_id)
  if (!run) return { ok: false, error: { type: 'ANALYSIS_RUN_NOT_FOUND' } }

  if (payload.status === 'failed') {
    const errorCode = normalizedErrorCode(payload.error_code)
    if (run.status === 'failed' && run.error_code === errorCode) {
      return { ok: true, value: { analysis_run_id: run.id, status: 'failed' } }
    }
    if (run.status === 'completed' || run.status === 'failed') {
      return { ok: false, error: { type: 'CALLBACK_ALREADY_FINALIZED' } }
    }
    const failed = await markAnalysisRunFailed(run.id, errorCode, now)
    if (!failed) return { ok: false, error: { type: 'CALLBACK_ALREADY_FINALIZED' } }
    return { ok: true, value: { analysis_run_id: failed.id, status: 'failed' } }
  }

  if (run.status === 'completed') {
    return { ok: true, value: { analysis_run_id: run.id, status: 'completed' } }
  }
  if (run.status !== 'processing') {
    return { ok: false, error: { type: 'CALLBACK_ALREADY_FINALIZED' } }
  }

  const inputs = await listAnalysisRunTrajectories(run.id)
  const heatmapText = await getAnalysisHeatmapObjectText(run.organization_id, run.id)
  let heatmap: unknown
  try {
    heatmap = heatmapText === undefined ? undefined : JSON.parse(heatmapText)
  } catch {
    heatmap = undefined
  }
  const parsed = stayHeatmapArtifactSchema.safeParse(heatmap)
  const expectedIds = new Set(inputs.map((input) => input.trajectory_id))
  const artifactIds = parsed.success
    ? new Set(parsed.data.trajectories.map((trajectory) => trajectory.trajectory_id))
    : new Set<string>()
  const idsMatch =
    parsed.success &&
    expectedIds.size === artifactIds.size &&
    [...expectedIds].every((id) => artifactIds.has(id))
  const csvObjectsExist = idsMatch
    ? await Promise.all(
        inputs.map((input) =>
          doesAnalysisTrajectoryCsvObjectExist(run.organization_id, run.id, input.trajectory_id)
        )
      )
    : []

  if (!idsMatch || csvObjectsExist.some((exists) => !exists)) {
    await markAnalysisRunFailed(run.id, 'ARTIFACT_VALIDATION_FAILED', now)
    return { ok: false, error: { type: 'CALLBACK_ARTIFACT_INVALID' } }
  }

  const completed = await markAnalysisRunCompleted(run.id, now)
  if (completed) {
    return { ok: true, value: { analysis_run_id: completed.id, status: 'completed' } }
  }
  const latest = await findAnalysisRunById(run.id)
  if (latest?.status === 'completed') {
    return { ok: true, value: { analysis_run_id: latest.id, status: 'completed' } }
  }
  return { ok: false, error: { type: 'CALLBACK_ALREADY_FINALIZED' } }
}
