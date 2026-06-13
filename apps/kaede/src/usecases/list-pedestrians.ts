import type { RequestActor } from '../middleware/request-actor-context.js'
import type { PedestriansListResponse } from '../schemas/pedestrians.js'
import { listPedestrians as listPedestrianRows } from '../services/pedestrians/index.js'
import type { AuthorizationError } from './authorization.js'
import { requireDashboardReadAccess } from './authorization.js'
import { toPedestrianResponse } from './pedestrian-response.js'

export type ListPedestriansResult =
  | {
      ok: true
      value: PedestriansListResponse
    }
  | {
      ok: false
      error: AuthorizationError
    }

export const listPedestrians = async (actor: RequestActor): Promise<ListPedestriansResult> => {
  const authorization = requireDashboardReadAccess(actor)

  if (!authorization.ok) {
    return authorization
  }

  const pedestrians = await listPedestrianRows({
    organizationIds: authorization.organizationIds,
  })

  return {
    ok: true,
    value: {
      pedestrians: pedestrians.map(toPedestrianResponse),
    },
  }
}
