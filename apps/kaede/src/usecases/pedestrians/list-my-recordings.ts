import type { RequestActor } from '../../middleware/request-actor-context.js'
import { buildPaginatedResult, decodePaginationCursor } from '../../schemas/pagination.js'
import type { PaginationQuery } from '../../schemas/pagination.js'
import type { RecordingDetailResponse } from '../../schemas/recordings.js'
import { findPedestrianByUserId } from '../../services/pedestrians/index.js'
import { listRecordingsByPedestrianIdPaginated } from '../../services/recordings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { toRecordingDetailResponse } from '../recordings/recording-response.js'

export type ListMyRecordingsResult =
  | {
      ok: true
      value: {
        recordings: RecordingDetailResponse[]
        pagination: {
          next_cursor: string | null
          total_count: number
        }
      }
    }
  | {
      ok: false
      error:
        | AuthorizationError
        | { type: 'PEDESTRIAN_NOT_FOUND' }
        | { type: 'PAGINATION_CURSOR_INVALID' }
    }

export const listMyRecordings = async (
  actor: RequestActor,
  query: PaginationQuery
): Promise<ListMyRecordingsResult> => {
  if (actor.type === 'service_client') {
    return {
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    }
  }

  const pedestrian = await findPedestrianByUserId(actor.user_id)

  if (!pedestrian) {
    return {
      ok: false,
      error: { type: 'PEDESTRIAN_NOT_FOUND' },
    }
  }

  const cursorResult = query.cursor ? decodePaginationCursor(query.cursor) : null

  if (cursorResult && !cursorResult.ok) {
    return cursorResult
  }

  const pageRows = await listRecordingsByPedestrianIdPaginated(pedestrian.id, {
    limit: query.limit,
    cursor: cursorResult?.value ?? null,
  })
  const page = buildPaginatedResult(pageRows.rows, query.limit, pageRows.totalCount)

  return {
    ok: true,
    value: {
      recordings: page.items.map(toRecordingDetailResponse),
      pagination: {
        next_cursor: page.nextCursor,
        total_count: page.totalCount,
      },
    },
  }
}
