import type { RequestActor } from '../../middleware/request-actor-context.js'
import { listFloors as listFloorRows } from '../../services/floors/index.js'
import { accessibleOrganizationIds } from '../authorization.js'
import { toFloorResponse } from './floor-response.js'

export const listFloors = async (actor: RequestActor) => {
  const floors = await listFloorRows({
    organizationIds: accessibleOrganizationIds(actor),
  })

  return {
    floors: await Promise.all(floors.map(toFloorResponse)),
  }
}
