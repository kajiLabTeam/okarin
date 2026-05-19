import type { CallbackRequest } from '../schemas/trajectories.js'
import {
  buildTrajectoryAnalyzedResultObjectKey,
  doesTrajectoryAnalyzedResultObjectExist,
} from '../services/storage/index.js'
import {
  findTrajectoryById,
  markTrajectoryCompleted,
  markTrajectoryFailed,
  verifyCallbackToken,
} from '../services/trajectories/index.js'

export type ReceiveCallbackError =
  | { type: 'CALLBACK_TOKEN_INVALID' }
  | { type: 'CALLBACK_TOKEN_EXPIRED' }
  | { type: 'TRAJECTORY_NOT_FOUND'; trajectoryId: string }
  | { type: 'CALLBACK_TRAJECTORY_MISMATCH'; trajectoryId: string; tokenTrajectoryId: string }
  | { type: 'CALLBACK_RESULT_OBJECT_KEY_MISMATCH'; trajectoryId: string; resultObjectKey: string }
  | { type: 'CALLBACK_ALREADY_FINALIZED'; trajectoryId: string; status: string }
  | { type: 'CALLBACK_DEPENDENCY_FAILURE'; trajectoryId: string }

export type ReceiveCallbackResult =
  | {
      ok: true
      value: {
        trajectory_id: string
        status: 'completed' | 'failed'
      }
    }
  | {
      ok: false
      error: ReceiveCallbackError
    }

const isFinalizedConflict = (status: string) => status === 'completed' || status === 'failed'

export const receiveCallback = async (
  payload: CallbackRequest,
  now: Date = new Date()
): Promise<ReceiveCallbackResult> => {
  const verified = verifyCallbackToken(payload.callback_token, now)
  if (!verified.ok) {
    return {
      ok: false,
      error: {
        type: verified.error,
      },
    }
  }

  if (verified.value.trajectoryId !== payload.trajectory_id) {
    return {
      ok: false,
      error: {
        type: 'CALLBACK_TRAJECTORY_MISMATCH',
        trajectoryId: payload.trajectory_id,
        tokenTrajectoryId: verified.value.trajectoryId,
      },
    }
  }

  const trajectory = await findTrajectoryById(payload.trajectory_id)
  if (!trajectory) {
    return {
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId: payload.trajectory_id,
      },
    }
  }

  if (payload.status === 'completed') {
    const expectedObjectKey = buildTrajectoryAnalyzedResultObjectKey(payload.trajectory_id)

    if (payload.result_object_key !== expectedObjectKey) {
      return {
        ok: false,
        error: {
          type: 'CALLBACK_RESULT_OBJECT_KEY_MISMATCH',
          trajectoryId: payload.trajectory_id,
          resultObjectKey: payload.result_object_key,
        },
      }
    }

    if (trajectory.status === 'completed') {
      return {
        ok: true,
        value: {
          trajectory_id: trajectory.id,
          status: 'completed',
        },
      }
    }

    if (trajectory.status === 'failed') {
      return {
        ok: false,
        error: {
          type: 'CALLBACK_ALREADY_FINALIZED',
          trajectoryId: trajectory.id,
          status: trajectory.status,
        },
      }
    }

    const exists = await doesTrajectoryAnalyzedResultObjectExist(trajectory.id)
    if (!exists) {
      return {
        ok: false,
        error: {
          type: 'CALLBACK_DEPENDENCY_FAILURE',
          trajectoryId: trajectory.id,
        },
      }
    }

    const completed = await markTrajectoryCompleted(trajectory.id)
    if (completed) {
      return {
        ok: true,
        value: {
          trajectory_id: completed.id,
          status: 'completed',
        },
      }
    }

    const latest = await findTrajectoryById(trajectory.id)
    if (!latest) {
      return {
        ok: false,
        error: {
          type: 'CALLBACK_DEPENDENCY_FAILURE',
          trajectoryId: trajectory.id,
        },
      }
    }

    if (latest.status === 'completed') {
      return {
        ok: true,
        value: {
          trajectory_id: latest.id,
          status: 'completed',
        },
      }
    }

    if (isFinalizedConflict(latest.status)) {
      return {
        ok: false,
        error: {
          type: 'CALLBACK_ALREADY_FINALIZED',
          trajectoryId: latest.id,
          status: latest.status,
        },
      }
    }

    return {
      ok: false,
      error: {
        type: 'CALLBACK_DEPENDENCY_FAILURE',
        trajectoryId: latest.id,
      },
    }
  }

  if (trajectory.status === 'failed') {
    if (
      trajectory.error_code === payload.error_code &&
      trajectory.error_message === payload.error_message
    ) {
      return {
        ok: true,
        value: {
          trajectory_id: trajectory.id,
          status: 'failed',
        },
      }
    }

    return {
      ok: false,
      error: {
        type: 'CALLBACK_ALREADY_FINALIZED',
        trajectoryId: trajectory.id,
        status: trajectory.status,
      },
    }
  }

  if (trajectory.status === 'completed') {
    return {
      ok: false,
      error: {
        type: 'CALLBACK_ALREADY_FINALIZED',
        trajectoryId: trajectory.id,
        status: trajectory.status,
      },
    }
  }

  const failed = await markTrajectoryFailed(
    trajectory.id,
    payload.error_code,
    payload.error_message
  )

  if (failed) {
    return {
      ok: true,
      value: {
        trajectory_id: failed.id,
        status: 'failed',
      },
    }
  }

  const latest = await findTrajectoryById(trajectory.id)
  if (!latest) {
    return {
      ok: false,
      error: {
        type: 'CALLBACK_DEPENDENCY_FAILURE',
        trajectoryId: trajectory.id,
      },
    }
  }

  if (
    latest.status === 'failed' &&
    latest.error_code === payload.error_code &&
    latest.error_message === payload.error_message
  ) {
    return {
      ok: true,
      value: {
        trajectory_id: latest.id,
        status: 'failed',
      },
    }
  }

  if (isFinalizedConflict(latest.status)) {
    return {
      ok: false,
      error: {
        type: 'CALLBACK_ALREADY_FINALIZED',
        trajectoryId: latest.id,
        status: latest.status,
      },
    }
  }

  return {
    ok: false,
    error: {
      type: 'CALLBACK_DEPENDENCY_FAILURE',
      trajectoryId: latest.id,
    },
  }
}
