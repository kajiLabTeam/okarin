import type { RequestActor } from '../middleware/request-actor-context.js'
import type { BuildingResponse, CreateBuildingRequest } from '../schemas/buildings.js'
import { insertBuilding } from '../services/buildings/index.js'
import { findOrganizationById } from '../services/organizations/index.js'
import type { AuthorizationError } from './authorization.js'
import { requireDashboardWriteAccess } from './authorization.js'

export type CreateBuildingResult =
  | {
      ok: true
      value: BuildingResponse
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

export const createBuilding = async (
  actor: RequestActor,
  payload: CreateBuildingRequest
): Promise<CreateBuildingResult> => {
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

  const building = await insertBuilding({
    organization_id: organization.id,
    name: payload.name,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
  })

  return {
    ok: true,
    value: {
      building_id: building.id,
      organization_id: organization.id,
      name: building.name,
      latitude: building.latitude,
      longitude: building.longitude,
      created_at: building.created_at.toISOString(),
      updated_at: building.updated_at.toISOString(),
    },
  }
}
