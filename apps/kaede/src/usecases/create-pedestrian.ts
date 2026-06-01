import type { CreatePedestrianRequest, PedestrianResponse } from '../schemas/pedestrians.js'
import type { JsonValue } from '../services/db/generated.js'
import { insertPedestrian } from '../services/pedestrians/index.js'

type PedestrianAttributes = PedestrianResponse['attributes']

const normalizeAttributes = (attributes: JsonValue): PedestrianAttributes => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as PedestrianAttributes
  }

  return {}
}

export const createPedestrian = async (
  payload: CreatePedestrianRequest
): Promise<PedestrianResponse> => {
  const pedestrian = await insertPedestrian({
    display_name: payload.display_name,
    height: payload.height ?? null,
    stride_length: payload.stride_length ?? null,
    attributes: payload.attributes ?? {},
  })

  return {
    pedestrian_id: pedestrian.id,
    display_name: pedestrian.display_name,
    height: pedestrian.height,
    stride_length: pedestrian.stride_length,
    attributes: normalizeAttributes(pedestrian.attributes),
    created_at: pedestrian.created_at.toISOString(),
    updated_at: pedestrian.updated_at.toISOString(),
  }
}
