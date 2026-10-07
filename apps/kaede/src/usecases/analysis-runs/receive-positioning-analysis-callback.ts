import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PositioningAnalysisCallbackRequest } from '../../schemas/positioning-analysis-callbacks.js'
import {
  findPositioningCallbackByEventId,
  findPositioningRunItemById,
  insertPositioningCallback,
  updatePositioningRunItemState,
} from '../../services/analysis-runs/positioning-analysis-callback-repository.js'
import { db } from '../../services/db/index.js'

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

    await updatePositioningRunItemState(
      payload.analysis_run_item_id,
      {
        status: payload.status,
        result_trajectory_id: null, // Note: 後続の集約WorkerまたはPayload解析でTrajectory IDを更新
        error: payload.error ?? null,
      },
      transaction
    )

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
