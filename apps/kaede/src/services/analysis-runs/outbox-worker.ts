import { createHash, randomUUID } from 'node:crypto'
import { getAppRuntimeConfig, getCallbackRuntimeConfig } from '../../config/runtime.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'
import { dispatchExecutionToNozomi, FatalDispatchError } from '../nozomi/nozomi-execution-client.js'
import type {
  NozomiExecutionInputManifest,
  NozomiExecutionRequest,
  NozomiExecutionSlotBinding,
} from '../nozomi/nozomi-execution-client.js'
import { getObjectBytes } from '../storage/object-store.js'
import {
  issueInternalDataAssetDownloadUrl,
  issueInternalPositioningAnalysisArtifactUploadUrl,
  issueInternalTrajectoryResultUploadUrl,
} from '../storage/presigned-url.js'
import { claimPendingOutboxJobs, completeOutboxJob, failOutboxJob } from './outbox-repository.js'
import type { OutboxJob } from './outbox-repository.js'
import {
  findPositioningRunItemById,
  updatePositioningRunItemState,
} from './positioning-analysis-callback-repository.js'
import {
  findPositioningRunById,
  findTimedOutPositioningRunItems,
  listPositioningItems,
  updatePositioningRunStatus,
} from './positioning-analysis-run-repository.js'

export const aggregatePositioningRunStatus = async (
  runId: string,
  executor: DbExecutor = db
): Promise<void> => {
  const items = await listPositioningItems(runId, executor)
  if (items.length === 0) return

  const allTerminal = items.every((item) => item.status === 'completed' || item.status === 'failed')
  if (!allTerminal) {
    const hasProcessing = items.some(
      (item) => item.status === 'processing' || item.status === 'completed'
    )
    if (hasProcessing) {
      await updatePositioningRunStatus(runId, 'processing', executor)
    }
    return
  }

  const completedCount = items.filter((item) => item.status === 'completed').length
  const failedCount = items.filter((item) => item.status === 'failed').length

  if (completedCount === items.length) {
    await updatePositioningRunStatus(runId, 'completed', executor)
  } else if (failedCount === items.length) {
    await updatePositioningRunStatus(runId, 'failed', executor)
  } else {
    await updatePositioningRunStatus(runId, 'partially_completed', executor)
  }
}

export const checkExecutionTimeouts = async (
  timeoutMinutes = 30,
  executor: DbExecutor = db
): Promise<number> => {
  const timedOutItems = await findTimedOutPositioningRunItems(timeoutMinutes, executor)
  for (const item of timedOutItems) {
    await updatePositioningRunItemState(
      item.id,
      {
        status: 'failed',
        error: {
          code: 'EXECUTION_TIMEOUT',
          message: `Execution timed out after ${timeoutMinutes} minutes`,
        },
      },
      executor
    )
    await aggregatePositioningRunStatus(item.analysis_run_id, executor)
  }
  return timedOutItems.length
}

export const processOutboxJob = async (
  job: OutboxJob,
  executor: DbExecutor = db
): Promise<void> => {
  if (job.job_type !== 'positioning_analysis_dispatch') {
    await completeOutboxJob(job.id, executor)
    return
  }

  const payload =
    typeof job.payload === 'string'
      ? (JSON.parse(job.payload) as Record<string, unknown>)
      : (job.payload as Record<string, unknown>)
  const itemId = payload.analysis_run_item_id as string | undefined

  if (!itemId) {
    await failOutboxJob(job.id, 'Missing analysis_run_item_id in payload', null, executor)
    return
  }

  const item = await findPositioningRunItemById(itemId, executor)
  if (!item) {
    await completeOutboxJob(job.id, executor)
    return
  }

  if (item.status === 'completed' || item.status === 'failed') {
    await completeOutboxJob(job.id, executor)
    return
  }

  const run = await findPositioningRunById(item.analysis_run_id, executor)
  if (!run) {
    await failOutboxJob(job.id, `Parent run ${item.analysis_run_id} not found`, null, executor)
    return
  }

  try {
    const rawInputManifest =
      typeof item.input_manifest === 'string'
        ? (JSON.parse(item.input_manifest) as Record<string, unknown>)
        : (item.input_manifest as Record<string, unknown>)
    const rawPipelineSnapshot =
      typeof item.pipeline_snapshot === 'string'
        ? (JSON.parse(item.pipeline_snapshot) as { bindings?: NozomiExecutionSlotBinding[] })
        : (item.pipeline_snapshot as { bindings?: NozomiExecutionSlotBinding[] })
    const rawParameters =
      typeof item.parameters === 'string'
        ? (JSON.parse(item.parameters) as Record<string, unknown>)
        : (item.parameters as Record<string, unknown>)

    const inputs: NozomiExecutionInputManifest[] = []
    const rawGroundTruth = rawInputManifest.__ground_truth__
    const groundTruth =
      rawGroundTruth && !Array.isArray(rawGroundTruth)
        ? (rawGroundTruth as {
            object_key: string
            checksum_sha256: string
          })
        : undefined
    for (const [slot_id, assets] of Object.entries(rawInputManifest)) {
      if (slot_id === '__ground_truth__') continue
      const assetList = Array.isArray(assets)
        ? (assets as {
            object_key: string
            data_type: string
            schema_version: string
            format: string
            checksum_sha256: string | null
          }[])
        : []
      for (const asset of assetList) {
        const { downloadUrl } = await issueInternalDataAssetDownloadUrl(asset.object_key)
        const assetDigest =
          asset.checksum_sha256 ??
          createHash('sha256')
            .update(await getObjectBytes(asset.object_key))
            .digest('hex')
        inputs.push({
          slot_id,
          contract: {
            kind: 'asset',
            data_type: asset.data_type,
            schema_version: asset.schema_version,
            format: asset.format,
          },
          uri: downloadUrl,
          digest: assetDigest,
          available: true,
        })
      }
    }

    const { uploadUrl } = await issueInternalTrajectoryResultUploadUrl(run.organization_id, item.id)
    const outputArtifacts: NonNullable<NozomiExecutionRequest['output_artifacts']> = {}
    if (item.pipeline_id.endsWith('-ble')) {
      const artifact = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'diagnostics',
        'json',
        'application/json'
      )
      outputArtifacts.diagnostics = {
        upload_uri: artifact.uploadUrl,
        object_key: artifact.objectKey,
        content_type: 'application/json',
        format: 'json',
      }
    }
    if (item.pipeline_id.includes('particle-filter')) {
      const artifact = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'particle_animation',
        'webm',
        'video/webm'
      )
      outputArtifacts.particle_animation = {
        upload_uri: artifact.uploadUrl,
        object_key: artifact.objectKey,
        content_type: 'video/webm',
        format: 'webm',
      }
      const fallback = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'particle_animation',
        'mp4',
        'video/mp4'
      )
      outputArtifacts.particle_animation_mp4 = {
        upload_uri: fallback.uploadUrl,
        object_key: fallback.objectKey,
        content_type: 'video/mp4',
        format: 'mp4',
        manifest_name: 'particle_animation',
      }
    }
    let groundTruthRequest: NozomiExecutionRequest['ground_truth']
    if (groundTruth) {
      const truth = await issueInternalDataAssetDownloadUrl(groundTruth.object_key)
      groundTruthRequest = {
        uri: truth.downloadUrl,
        digest: groundTruth.checksum_sha256,
      }
      const groundTruthArtifact = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'ground_truth',
        'csv',
        'text/csv'
      )
      outputArtifacts.ground_truth = {
        upload_uri: groundTruthArtifact.uploadUrl,
        object_key: groundTruthArtifact.objectKey,
        content_type: 'text/csv',
        format: 'csv',
      }
      const evaluationCsv = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'evaluation_csv',
        'csv',
        'text/csv'
      )
      outputArtifacts.evaluation_csv = {
        upload_uri: evaluationCsv.uploadUrl,
        object_key: evaluationCsv.objectKey,
        content_type: 'text/csv',
        format: 'csv',
      }
      const evaluationSummary = await issueInternalPositioningAnalysisArtifactUploadUrl(
        run.organization_id,
        run.id,
        item.id,
        'evaluation_summary',
        'json',
        'application/json'
      )
      outputArtifacts.evaluation_summary = {
        upload_uri: evaluationSummary.uploadUrl,
        object_key: evaluationSummary.objectKey,
        content_type: 'application/json',
        format: 'json',
      }
    }

    const callbackConfig = getCallbackRuntimeConfig()
    const appConfig = getAppRuntimeConfig()

    const request: NozomiExecutionRequest = {
      analysis_run_item_id: item.id,
      pipeline_id: item.pipeline_id,
      snapshot_digest: item.pipeline_digest,
      inputs,
      bindings: rawPipelineSnapshot.bindings ?? [],
      output_uri: uploadUrl,
      output_artifacts: outputArtifacts,
      callback: {
        url: `${callbackConfig.baseUrl}/api/internal/pipeline-executions/callbacks`,
        secret: appConfig.apiSharedToken ?? null,
      },
      parameters: rawParameters,
      ...(groundTruthRequest ? { ground_truth: groundTruthRequest } : {}),
    }

    await updatePositioningRunItemState(item.id, { status: 'processing' }, executor)
    await updatePositioningRunStatus(run.id, 'processing', executor)

    await dispatchExecutionToNozomi(request)
    await completeOutboxJob(job.id, executor)
  } catch (error) {
    const isFatal = error instanceof FatalDispatchError
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (isFatal || job.attempts >= job.max_attempts) {
      await failOutboxJob(job.id, errorMessage, null, executor)
      await updatePositioningRunItemState(
        item.id,
        {
          status: 'failed',
          error: {
            code: isFatal ? 'DISPATCH_REJECTED' : 'DISPATCH_RETRY_EXHAUSTED',
            message: errorMessage,
          },
        },
        executor
      )
      await aggregatePositioningRunStatus(run.id, executor)
    } else {
      const backoffMs = Math.pow(2, job.attempts) * 1000
      const retryAt = new Date(Date.now() + backoffMs)
      await failOutboxJob(job.id, errorMessage, retryAt, executor)
    }
  }
}

export interface TickResult {
  claimedCount: number
  timedOutCount: number
}

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null
  private running = false

  async tick(leaseToken: string = randomUUID()): Promise<TickResult> {
    const jobs = await claimPendingOutboxJobs(
      {
        limit: 10,
        leaseDurationMs: 60 * 1000,
        leaseToken,
      },
      db
    )

    for (const job of jobs) {
      await processOutboxJob(job, db)
    }

    const timedOutCount = await checkExecutionTimeouts(30, db)

    return {
      claimedCount: jobs.length,
      timedOutCount,
    }
  }

  start(intervalMs = 3000): void {
    if (this.running) return
    this.running = true

    const scheduleNext = () => {
      if (!this.running) return
      this.timer = setTimeout(() => {
        void this.tick()
          .catch((error: unknown) => {
            console.error('OutboxWorker error during tick:', error)
          })
          .finally(() => {
            scheduleNext()
          })
      }, intervalMs)
    }

    scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export const outboxWorker = new OutboxWorker()
