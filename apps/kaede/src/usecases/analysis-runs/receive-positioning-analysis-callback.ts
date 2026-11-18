import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import { trajectoryConstraintsSchema } from '../../schemas/trajectories.js'
import { aggregatePositioningRunStatus } from '../../services/analysis-runs/outbox-worker.js'
import { outputArtifactsFromCallback } from '../../services/analysis-runs/output-manifest.js'
import {
  findPositioningCallbackByEventId,
  findPositioningRunItemById,
  findPositioningRunItemByIdForUpdate,
  insertPositioningCallback,
  mergePositioningRunItemOutputManifest,
  updatePositioningRunItemState,
} from '../../services/analysis-runs/positioning-analysis-callback-repository.js'
import { db } from '../../services/db/index.js'
import { findRecordingById } from '../../services/recordings/index.js'
import {
  insertTrajectory,
  markTrajectoryCompleted,
  markTrajectoryFailed,
} from '../../services/trajectories/index.js'

export type ReceivePositioningAnalysisCallbackResult =
  | {
      ok: true
      value: {
        event_id: string
        status: 'accepted' | 'already_processed'
      }
    }
  | {
      ok: false
      error: {
        type:
          'UNAUTHORIZED' | 'RUN_ITEM_NOT_FOUND' | 'CALLBACK_ALREADY_PROCESSED' | 'INTERNAL_ERROR'
        status: number
        message?: string
      }
    }

export const receivePositioningAnalysisCallback = async (
  actor: RequestActor,
  payload: PositioningAnalysisCallbackRequest
): Promise<ReceivePositioningAnalysisCallbackResult> => {
  if (actor.type !== 'service_client') {
    return {
      ok: false,
      error: {
        type: 'UNAUTHORIZED',
        status: 401,
        message: 'service client authorization is required for internal callbacks',
      },
    }
  }

  const existingCallback = await findPositioningCallbackByEventId(payload.event_id)
  if (existingCallback) {
    return {
      ok: true,
      value: {
        event_id: payload.event_id,
        status: 'already_processed',
      },
    }
  }

  const item = await findPositioningRunItemById(payload.analysis_run_item_id)
  if (!item) {
    return {
      ok: false,
      error: {
        type: 'RUN_ITEM_NOT_FOUND',
        status: 404,
        message: `analysis run item ${payload.analysis_run_item_id} not found`,
      },
    }
  }

  const result = await db.transaction().execute(async (transaction) => {
    const inserted = await insertPositioningCallback(
      {
        event_id: payload.event_id,
        analysis_run_item_id: payload.analysis_run_item_id,
        status: payload.status,
        payload,
        processed_at: new Date(),
      },
      transaction
    )

    if (!inserted) {
      return { status: 'already_processed' as const }
    }

    const lockedItem = await findPositioningRunItemByIdForUpdate(
      payload.analysis_run_item_id,
      transaction
    )
    if (!lockedItem) {
      throw new Error(`analysis run item ${payload.analysis_run_item_id} disappeared`)
    }

    const manifest =
      typeof lockedItem.input_manifest === 'string'
        ? (JSON.parse(lockedItem.input_manifest) as Record<string, unknown>)
        : ((lockedItem.input_manifest ?? {}) as Record<string, unknown>)
    const legacy = manifest.__legacy_trajectory__ as { constraints?: unknown } | undefined
    if (
      legacy &&
      (lockedItem.status === 'completed' || lockedItem.status === 'failed') &&
      payload.status !== lockedItem.status
    )
      return { status: 'already_processed' as const }
    const outputArtifacts = outputArtifactsFromCallback(payload.outputs)
    if (Object.keys(outputArtifacts).length > 0) {
      await mergePositioningRunItemOutputManifest(
        payload.analysis_run_item_id,
        outputArtifacts,
        transaction
      )
    }

    let trajectoryId: string | null = null
    if (payload.status === 'completed') {
      trajectoryId = lockedItem.result_trajectory_id
      if (!trajectoryId) {
        const recording = await findRecordingById(lockedItem.recording_id, transaction)
        const trajectory = await insertTrajectory(
          {
            id: lockedItem.id,
            organization_id: recording?.organization_id ?? '',
            recording_id: lockedItem.recording_id,
            floor_id: recording?.floor_id ?? '',
            status: 'completed',
            ...(legacy?.constraints
              ? { constraints: trajectoryConstraintsSchema.parse(legacy.constraints) }
              : {}),
          },
          transaction
        )
        trajectoryId = trajectory.id
      }
    }

    if (legacy && lockedItem.result_trajectory_id) {
      if (payload.status === 'completed')
        await markTrajectoryCompleted(lockedItem.result_trajectory_id, transaction)
      if (payload.status === 'failed')
        await markTrajectoryFailed(
          lockedItem.result_trajectory_id,
          payload.error?.code ?? 'EXECUTION_FAILED',
          payload.error?.message ?? 'Pipeline execution failed',
          new Date(),
          transaction
        )
    }
    await updatePositioningRunItemState(
      payload.analysis_run_item_id,
      {
        status: payload.status,
        result_trajectory_id:
          payload.status === 'completed' ? trajectoryId : lockedItem.result_trajectory_id,
        error:
          payload.status === 'failed'
            ? (payload.error ?? { code: 'EXECUTION_FAILED', message: 'Pipeline execution failed' })
            : null,
      },
      transaction
    )

    await aggregatePositioningRunStatus(item.analysis_run_id, transaction)

    return { status: 'accepted' as const }
  })

  return {
    ok: true,
    value: {
      event_id: payload.event_id,
      status: result.status,
    },
  }
}
