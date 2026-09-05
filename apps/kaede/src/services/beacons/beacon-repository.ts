import type { Insertable, Selectable, Updateable } from 'kysely'
import type { PaginationOptions } from '../../schemas/pagination.js'
import type { Beacons } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type Beacon = Selectable<Beacons>
export type NewBeacon = Insertable<Beacons>
export type BeaconUpdate = Updateable<Beacons>

export const listBeacons = async (
  floorId: string,
  includeDisabled = false,
  options?: PaginationOptions,
  executor: DbExecutor = db
) => {
  let query = executor
    .selectFrom('beacons')
    .selectAll()
    .where('floor_id', '=', floorId)
    .where('deleted_at', 'is', null)
  if (!includeDisabled) query = query.where('enabled', '=', true)
  if (options?.cursor) {
    const cursor = options.cursor
    query = query.where((expressionBuilder) =>
      expressionBuilder.or([
        expressionBuilder.eb('created_at', '<', new Date(cursor.createdAt)),
        expressionBuilder
          .eb('created_at', '=', new Date(cursor.createdAt))
          .and('id', '<', cursor.id),
      ])
    )
  }
  query = query.orderBy('created_at', 'desc').orderBy('id', 'desc')
  if (options) query = query.limit(options.limit + 1)
  return query.execute()
}

export const countBeacons = async (floorId: string, includeDisabled = false) => {
  let query = db
    .selectFrom('beacons')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('floor_id', '=', floorId)
    .where('deleted_at', 'is', null)
  if (!includeDisabled) query = query.where('enabled', '=', true)
  const row = await query.executeTakeFirstOrThrow()
  return Number(row.count)
}

export const findBeacon = async (
  organizationId: string,
  beaconId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('beacons')
    .selectAll()
    .where('id', '=', beaconId)
    .where('organization_id', '=', organizationId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

export const insertBeaconWithFloorLock = async (value: NewBeacon) =>
  db.transaction().execute(async (tx) => {
    await tx
      .selectFrom('floors')
      .select('id')
      .where('id', '=', value.floor_id)
      .forUpdate()
      .executeTakeFirstOrThrow()
    const count = await tx
      .selectFrom('beacons')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('floor_id', '=', value.floor_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow()
    if (Number(count.count) >= 1000) return undefined
    return tx.insertInto('beacons').values(value).returningAll().executeTakeFirstOrThrow()
  })

export const updateBeacon = async (organizationId: string, beaconId: string, patch: BeaconUpdate) =>
  db
    .updateTable('beacons')
    .set(patch)
    .where('id', '=', beaconId)
    .where('organization_id', '=', organizationId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst()

export const softDeleteBeacon = async (organizationId: string, beaconId: string) =>
  updateBeacon(organizationId, beaconId, { deleted_at: new Date(), enabled: false })
