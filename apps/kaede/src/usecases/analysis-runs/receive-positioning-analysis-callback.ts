import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import { aggregatePositioningRunStatus } from '../../services/analysis-runs/outbox-worker.js'
import {
  findPositioningCallbackByEventId,
  findPositioningRunItemById,
  insertPositioningCallback,
  updatePositioningRunItemState,
} from '../../services/analysis-runs/positioning-analysis-callback-repository.js'
import { db } from '../../services/db/index.js'
import { findRecordingById } from '../../services/recordings/index.js'
import { insertTrajectory } from '../../services/trajectories/index.js'

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
          | 'UNAUTHORIZED'
          | 'RUN_ITEM_NOT_FOUND'
          | 'CALLBACK_ALREADY_PROCESSED'
          | 'INTERNAL_ERROR'
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

    let trajectoryId: string | null = null
    if (payload.status === 'completed') {
      const recording = await findRecordingById(item.recording_id, transaction)
      const trajectory = await insertTrajectory(
        {
          organization_id: recording?.organization_id ?? '',
          recording_id: item.recording_id,
          floor_id: recording?.floor_id ?? '',
          status: 'completed',
        },
        transaction
      )
      trajectoryId = trajectory.id
    }

    await updatePositioningRunItemState(
      payload.analysis_run_item_id,
      {
        status: payload.status,
        result_trajectory_id: trajectoryId,
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
