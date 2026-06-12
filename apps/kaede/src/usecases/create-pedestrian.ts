import type { CreatePedestrianRequest, PedestrianResponse } from '../schemas/pedestrians.js'
import { findOrganizationById } from '../services/organizations/index.js'
import { insertPedestrian } from '../services/pedestrians/index.js'

type PedestrianAttributes = PedestrianResponse['attributes']

const normalizeAttributes = (attributes: unknown): PedestrianAttributes => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as PedestrianAttributes
  }

  return {}
}

export const createPedestrian = async (
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
    value: {
      pedestrian_id: pedestrian.id,
      organization_id: organization.id,
      display_name: pedestrian.display_name,
      height: pedestrian.height,
      stride_length: pedestrian.stride_length,
      attributes: normalizeAttributes(pedestrian.attributes),
      created_at: pedestrian.created_at.toISOString(),
      updated_at: pedestrian.updated_at.toISOString(),
    },
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
