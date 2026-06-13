import type { PedestrianResponse } from '../schemas/pedestrians.js'
import type { Pedestrian } from '../services/pedestrians/index.js'

type PedestrianAttributes = PedestrianResponse['attributes']

const normalizeAttributes = (attributes: unknown): PedestrianAttributes => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as PedestrianAttributes
  }

  return {}
}

const requireOrganizationId = (pedestrianId: string, organizationId: string | null): string => {
  if (!organizationId) {
    throw new Error(`pedestrian ${pedestrianId} does not have organization_id`)
  }

  return organizationId
}

export const toPedestrianResponse = (pedestrian: Pedestrian): PedestrianResponse => ({
  pedestrian_id: pedestrian.id,
  organization_id: requireOrganizationId(pedestrian.id, pedestrian.organization_id),
  display_name: pedestrian.display_name,
  height: pedestrian.height,
  stride_length: pedestrian.stride_length,
  attributes: normalizeAttributes(pedestrian.attributes),
  created_at: pedestrian.created_at.toISOString(),
  updated_at: pedestrian.updated_at.toISOString(),
})
