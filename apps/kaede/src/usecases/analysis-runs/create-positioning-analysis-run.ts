import { createHash } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { Pipeline } from '../../schemas/pipelines.js'
import type { PositioningAnalysisRunRequest } from '../../schemas/positioning-analysis-runs.js'
import { insertOutboxJobs } from '../../services/analysis-runs/outbox-repository.js'
import {
  findPositioningRunByKey,
  findPositioningRunInOrganization,
  insertPositioningItems,
  insertPositioningRun,
} from '../../services/analysis-runs/positioning-analysis-run-repository.js'
import { db } from '../../services/db/index.js'
import { resolvePipelineForExecution } from '../../services/nozomi/pipeline-availability.js'
import type { ResolvedPipelineRecording } from '../../services/nozomi/pipeline-availability.js'
import { NozomiPipelineError } from '../../services/nozomi/pipeline-client.js'
import {
  findRecordingAuthorizationByIdForOrganization,
  findRecordingByIdForOrganization,
} from '../../services/recordings/index.js'
import { requireOrganizationManager, requireRecordingAccess } from '../authorization.js'

interface Failure {
  type: string
  status?: number
  message?: string
}
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value
      .map(canonicalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  return value
}
const digest = (body: PositioningAnalysisRunRequest) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex')
const parametersMatchSchema = (value: Record<string, unknown>, schema: Record<string, unknown>) => {
  if (schema.type !== 'object') return true
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : []
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, { type?: string }>)
      : {}
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.entries(value).every(([key, entry]) => {
      const property = Object.prototype.hasOwnProperty.call(properties, key)
        ? properties[key]
        : undefined
      const type = property?.type
      return (
        !type ||
        (type === 'number' && typeof entry === 'number') ||
        (type === 'string' && typeof entry === 'string') ||
        (type === 'boolean' && typeof entry === 'boolean') ||
        (type === 'object' && typeof entry === 'object' && entry !== null)
      )
    })
  )
}

export const createPositioningAnalysisRun = async (
  actor: RequestActor,
  organizationId: string,
  key: string,
  body: PositioningAnalysisRunRequest
): Promise<
  | { ok: true; value: { analysis_run_id: string; status: 'accepted'; item_count: number } }
  | { ok: false; error: Failure }
> => {
  const authorization = requireOrganizationManager(actor, organizationId)
  if (!authorization.ok) return { ok: false, error: authorization.error }
  if (!key.trim() || key.length > 200)
    return { ok: false, error: { type: 'IDEMPOTENCY_KEY_INVALID', status: 400 } }
  const requestDigest = digest(body)
  const existing = await findPositioningRunByKey(organizationId, key)
  if (existing) {
    if (existing.request_digest !== requestDigest)
      return { ok: false, error: { type: 'IDEMPOTENCY_CONFLICT', status: 409 } }
    return {
      ok: true,
      value: {
        analysis_run_id: existing.id,
        status: 'accepted',
        item_count: body.recording_ids.length * body.pipeline_ids.length,
      },
    }
  }
  if (
    body.retry_of_analysis_run_id &&
    !(await findPositioningRunInOrganization(organizationId, body.retry_of_analysis_run_id))
  )
    return { ok: false, error: { type: 'RETRY_RUN_NOT_FOUND', status: 404 } }
  const recordings = [] as { id: string; floor_id: string }[]
  for (const recordingId of body.recording_ids) {
    const recording = await findRecordingByIdForOrganization(recordingId, organizationId)
    const access = await findRecordingAuthorizationByIdForOrganization(recordingId, organizationId)
    if (!recording || !access)
      return { ok: false, error: { type: 'RECORDING_NOT_FOUND', status: 404 } }
    const recordingAccess = requireRecordingAccess(actor, access)
    if (!recordingAccess.ok) return { ok: false, error: { ...recordingAccess.error, status: 403 } }
    recordings.push({ id: recording.id, floor_id: recording.floor_id })
  }
  if (new Set(recordings.map((recording) => recording.floor_id)).size > 1)
    return { ok: false, error: { type: 'RECORDING_SCOPE_INVALID', status: 409 } }
  const resolutions = [] as { pipeline: Pipeline; recordings: ResolvedPipelineRecording[] }[]
  for (const pipelineId of body.pipeline_ids) {
    let resolved: Awaited<ReturnType<typeof resolvePipelineForExecution>>
    try {
      resolved = await resolvePipelineForExecution(pipelineId, body.recording_ids)
    } catch (error) {
      if (error instanceof NozomiPipelineError && error.code === 'PIPELINE_NOT_FOUND')
        return {
          ok: false,
          error: { type: 'PIPELINE_NOT_FOUND', status: 404, message: String(error) },
        }
      return {
        ok: false,
        error: { type: 'NOZOMI_UNAVAILABLE', status: 502, message: String(error) },
      }
    }
    if (!resolved.ok) return { ok: false, error: { type: resolved.error.type, status: 409 } }
    const parameters = body.parameters_by_pipeline[pipelineId] ?? {}
    if (!parametersMatchSchema(parameters, resolved.value.pipeline.definition.parameters_schema))
      return { ok: false, error: { type: 'PARAMETERS_INVALID', status: 400 } }
    resolutions.push(resolved.value)
  }
  try {
    const result = await db.transaction().execute(async (transaction) => {
      const run = await insertPositioningRun(
        {
          organization_id: organizationId,
          status: 'accepted',
          idempotency_key: key,
          request_digest: requestDigest,
          retry_of_run_id: body.retry_of_analysis_run_id ?? null,
        },
        transaction
      )
      const items = resolutions.flatMap(({ pipeline, recordings }) =>
        recordings.map(({ recording_id, bindings, assets }) => ({
          analysis_run_id: run.id,
          recording_id,
          pipeline_id: pipeline.definition.pipeline_id,
          status: 'queued',
          slot_bindings: bindings,
          pipeline_snapshot: pipeline.definition,
          pipeline_digest: pipeline.digest,
          pipeline_version: pipeline.definition.definition_version,
          parameters: Object.prototype.hasOwnProperty.call(
            body.parameters_by_pipeline,
            pipeline.definition.pipeline_id
          )
            ? body.parameters_by_pipeline[pipeline.definition.pipeline_id]
            : {},
          input_manifest: Object.fromEntries(
            Object.entries(bindings).map(([slot_id, assetId]) => [
              slot_id,
              assets
                .filter((asset) => asset.data_asset_id === assetId)
                .map((asset) => ({
                  data_asset_id: asset.data_asset_id,
                  data_asset_object_id: asset.data_asset_object_id,
                  object_key: asset.object_key,
                  checksum_sha256: asset.checksum_sha256,
                  data_type: asset.data_type,
                  schema_version: asset.schema_version,
                  format: asset.format,
                })),
            ])
          ),
          error: null,
        }))
      )
      const insertedItems = await insertPositioningItems(items, transaction)
      await insertOutboxJobs(
        insertedItems.map((item) => ({
          job_type: 'positioning_analysis_dispatch',
          payload: { analysis_run_item_id: item.id },
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          run_at: new Date(),
        })),
        transaction
      )
      return run
    })
    return {
      ok: true,
      value: {
        analysis_run_id: result.id,
        status: 'accepted',
        item_count: body.recording_ids.length * body.pipeline_ids.length,
      },
    }
  } catch (error) {
    if (String(error).includes('positioning_analysis_runs_organization_idempotency_key_key')) {
      const retry = await findPositioningRunByKey(organizationId, key)
      if (retry?.request_digest === requestDigest)
        return {
          ok: true,
          value: {
            analysis_run_id: retry.id,
            status: 'accepted',
            item_count: body.recording_ids.length * body.pipeline_ids.length,
          },
        }
    }
    throw error
  }
}
