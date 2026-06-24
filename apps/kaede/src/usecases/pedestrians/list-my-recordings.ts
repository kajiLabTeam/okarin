import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { RecordingDetailResponse } from '../../schemas/recordings.js'
import { findPedestrianByUserId } from '../../services/pedestrians/index.js'
import { listRecordingsByPedestrianId } from '../../services/recordings/index.js'
import type { AuthorizationError } from '../authorization.js'
import { toRecordingDetailResponse } from '../recordings/recording-response.js'

export type ListMyRecordingsResult =
  | {
      ok: true
      value: {
        recordings: RecordingDetailResponse[]
      }
    }
  | {
      ok: false
      error: AuthorizationError | { type: 'PEDESTRIAN_NOT_FOUND' }
    }

export const listMyRecordings = async (actor: RequestActor): Promise<ListMyRecordingsResult> => {
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

  const recordings = await listRecordingsByPedestrianId(pedestrian.id)

  return {
    ok: true,
    value: {
      recordings: recordings.map(toRecordingDetailResponse),
    },
  }
}
