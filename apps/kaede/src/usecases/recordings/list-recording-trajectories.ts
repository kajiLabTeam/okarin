import type { RequestActor } from '../../middleware/request-actor-context.js'
import { buildPaginatedResult, decodePaginationCursor } from '../../schemas/pagination.js'
import type { PaginationQuery } from '../../schemas/pagination.js'
import type { RecordingIdParams, RecordingTrajectoriesResponse } from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationById,
  findRecordingById,
} from '../../services/recordings/index.js'
import type { Trajectory } from '../../services/trajectories/index.js'
import { listTrajectoriesByRecordingIdPaginated } from '../../services/trajectories/index.js'
import type { AuthorizationError } from '../authorization.js'
import { requireOrganizationManager } from '../authorization.js'

export type ListRecordingTrajectoriesError =
  | AuthorizationError
  | {
      type: 'RECORDING_NOT_FOUND'
      recordingId: string
    }
  | {
      type: 'PAGINATION_CURSOR_INVALID'
    }

export type ListRecordingTrajectoriesResult =
  | {
      ok: true
      value: RecordingTrajectoriesResponse
    }
  | {
      ok: false
      error: ListRecordingTrajectoriesError
    }

const toTrajectorySummary = (
  trajectory: Trajectory
): RecordingTrajectoriesResponse['trajectories'][number] => ({
  trajectory_id: trajectory.id,
  organization_id: trajectory.organization_id,
  status: trajectory.status as RecordingTrajectoriesResponse['trajectories'][number]['status'],
  created_at: trajectory.created_at.toISOString(),
})

export const listRecordingTrajectories = async (
  actor: RequestActor,
  params: RecordingIdParams,
  query: PaginationQuery
): Promise<ListRecordingTrajectoriesResult> => {
  const recording = await findRecordingById(params.recordingId)

  if (!recording) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: params.recordingId,
      },
    }
  }

  const recordingAuthorization = await findRecordingAuthorizationById(recording.id)

  if (!recordingAuthorization) {
    return {
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: recording.id,
      },
    }
  }

  const authorization = requireOrganizationManager(actor, recordingAuthorization.organization_id)

  if (!authorization.ok) {
    return authorization
  }

  const cursorResult = query.cursor ? decodePaginationCursor(query.cursor) : null

  if (cursorResult && !cursorResult.ok) {
    return cursorResult
  }

  const pageRows = await listTrajectoriesByRecordingIdPaginated(recording.id, {
    limit: query.limit,
    cursor: cursorResult?.value ?? null,
  })
  const page = buildPaginatedResult(pageRows.rows, query.limit, pageRows.totalCount)

  return {
    ok: true,
    value: {
      recording_id: recording.id,
      trajectories: page.items.map(toTrajectorySummary),
      pagination: {
        next_cursor: page.nextCursor,
        total_count: page.totalCount,
      },
    },
  }
}
