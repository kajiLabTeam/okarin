import type { RequestActor } from '../middleware/request-actor-context.js'
import type { CreatePedestrianRequest, PedestrianResponse } from '../schemas/pedestrians.js'
import { findOrganizationById } from '../services/organizations/index.js'
import { insertPedestrian } from '../services/pedestrians/index.js'
import type { AuthorizationError } from './authorization.js'
import { requireDashboardWriteAccess } from './authorization.js'
import { toPedestrianResponse } from './pedestrian-response.js'

export const createPedestrian = async (
  actor: RequestActor,
  payload: CreatePedestrianRequest
): Promise<CreatePedestrianResult> => {
  const organization = await findOrganizationById(payload.organization_id)

  if (!organization) {
    return {
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId: payload.organization_id,
      },
    }
  }

  const authorization = requireDashboardWriteAccess(actor, organization.id)

  if (!authorization.ok) {
    return authorization
  }

  const pedestrian = await insertPedestrian({
    organization_id: organization.id,
    display_name: payload.display_name,
    height: payload.height ?? null,
    stride_length: payload.stride_length ?? null,
    attributes: payload.attributes ?? {},
    user_id: null,
  })

  return {
    ok: true,
    value: toPedestrianResponse(pedestrian),
  }
}

export type CreatePedestrianResult =
  | {
      ok: true
      value: PedestrianResponse
    }
  | {
      ok: false
      error: {
        type: 'ORGANIZATION_NOT_FOUND'
        organizationId: string
      }
    }
  | {
      ok: false
      error: AuthorizationError
    }
