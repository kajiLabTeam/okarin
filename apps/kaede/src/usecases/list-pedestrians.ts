import type { PedestriansListResponse } from '../schemas/pedestrians.js'
import { listPedestrians as listPedestrianRows } from '../services/pedestrians/index.js'

type PedestrianAttributes = PedestriansListResponse['pedestrians'][number]['attributes']

const normalizeAttributes = (attributes: unknown): PedestrianAttributes => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as PedestrianAttributes
  }

  return {}
}

export const listPedestrians = async (): Promise<PedestriansListResponse> => {
  const pedestrians = await listPedestrianRows()

  return {
    pedestrians: pedestrians.map((pedestrian) => ({
      pedestrian_id: pedestrian.id,
      display_name: pedestrian.display_name,
      height: pedestrian.height,
      stride_length: pedestrian.stride_length,
      attributes: normalizeAttributes(pedestrian.attributes),
      created_at: pedestrian.created_at.toISOString(),
      updated_at: pedestrian.updated_at.toISOString(),
    })),
  }
}
