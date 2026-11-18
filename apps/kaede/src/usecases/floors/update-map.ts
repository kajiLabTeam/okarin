import * as Sentry from '@sentry/node'
import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { db } from '../../services/db/index.js'
import { findFloorDetailById, updateFloor } from '../../services/floors/index.js'
import {
  buildFloorMapObjectKey,
  putFloorMapObject,
  deleteFloorMapObject,
} from '../../services/storage/index.js'
import { requireDashboardWriteAccess } from '../authorization.js'
import { validateFloorMapImage } from './create-floor.js'
import type { FloorMapImageUpload } from './create-floor.js'
import { toFloorResponse } from './floor-response.js'

export const updateMap = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string,
  image: FloorMapImageUpload,
  scale?: number | null
) => {
  const floor = await findFloorDetailById(floorId, { organizationIds: [organizationId] })
  if (!floor) return { ok: false, error: { type: 'FLOOR_NOT_FOUND' } } as const
  const authorization = requireDashboardWriteAccess(actor, organizationId)
  if (!authorization.ok) return authorization
  const validated = validateFloorMapImage(image)
  if (!validated.ok) return validated
  const key = buildFloorMapObjectKey(organizationId, floorId, validated.extension, randomUUID())
  await putFloorMapObject(key, validated.extension, image.bytes)
  try {
    const updated = await updateFloor(floorId, {
      image_object_path: key,
      map_width_px: validated.dimensions.width,
      map_height_px: validated.dimensions.height,
      ...(scale !== undefined ? { scale } : {}),
    })
    if (!updated) throw new Error('Floor was deleted during map upload')
  } catch (error) {
    try {
      const referenced = await db
        .selectFrom('floor_map_revisions')
        .select('id')
        .where('image_object_path', '=', key)
        .executeTakeFirst()
      if (!referenced) await deleteFloorMapObject(key)
    } catch (cleanupError) {
      Sentry.captureException(cleanupError)
    }
    throw error
  }
  const updated = await findFloorDetailById(floorId, { organizationIds: [organizationId] })
  if (!updated) return { ok: false, error: { type: 'FLOOR_NOT_FOUND' } } as const
  const revision = await db
    .selectFrom('floor_map_revisions')
    .selectAll()
    .where('floor_id', '=', floorId)
    .where('organization_id', '=', organizationId)
    .where('image_object_path', '=', key)
    .executeTakeFirstOrThrow()
  return {
    ok: true,
    value: await toFloorResponse({
      ...updated,
      ...revision,
      floor_id: floorId,
      floor_map_revision_id: revision.id,
    }),
  } as const
}
