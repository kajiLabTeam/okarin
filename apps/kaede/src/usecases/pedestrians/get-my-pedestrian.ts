import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { PedestrianResponse } from '../../schemas/pedestrians.js'
import { findPedestrianByUserId } from '../../services/pedestrians/index.js'
import type { AuthorizationError } from '../authorization.js'
import { toPedestrianResponse } from './pedestrian-response.js'

export type GetMyPedestrianResult =
  | {
      ok: true
      value: PedestrianResponse
    }
  | {
      ok: false
      error: AuthorizationError | { type: 'PEDESTRIAN_NOT_FOUND' }
    }

export const getMyPedestrian = async (actor: RequestActor): Promise<GetMyPedestrianResult> => {
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

  return {
    ok: true,
    value: toPedestrianResponse(pedestrian),
  }
}
