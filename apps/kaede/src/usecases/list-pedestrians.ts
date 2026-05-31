import type { JsonValue } from '../services/db/generated.js'
import { listPedestrians as listPedestrianRows } from '../services/pedestrians/index.js'

const normalizeAttributes = (attributes: JsonValue) => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes
  }

  return {}
}

export const listPedestrians = async () => {
  const pedestrians = await listPedestrianRows()

  return {
    pedestrians: pedestrians.map((pedestrian) => ({
      pedestrian_id: pedestrian.id,
      height: pedestrian.height,
      stride_length: pedestrian.stride_length,
      attributes: normalizeAttributes(pedestrian.attributes),
      created_at: pedestrian.created_at.toISOString(),
      updated_at: pedestrian.updated_at.toISOString(),
    })),
  }
}
