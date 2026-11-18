import type { Beacon } from '../beacons/index.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

/** An omitted recording reference always means the initial revision, never current. */
export const findMapRevision = async (
  floorId: string,
  organizationId: string,
  revisionId?: string | null,
  executor: DbExecutor = db
) => {
  let query = executor
    .selectFrom('floor_map_revisions')
    .selectAll()
    .where('floor_id', '=', floorId)
    .where('organization_id', '=', organizationId)
  query = revisionId ? query.where('id', '=', revisionId) : query.where('revision', '=', 1)
  return query.executeTakeFirst()
}

export const listMapRevisions = (floorId: string, organizationId: string) =>
  db
    .selectFrom('floor_map_revisions')
    .selectAll()
    .where('floor_id', '=', floorId)
    .where('organization_id', '=', organizationId)
    .orderBy('revision', 'desc')
    .execute()

/** Share-lock the floor so an archive and a beacon edit cannot be mixed. */
export const listRevisionBeacons = async (
  floorId: string,
  organizationId: string,
  revisionId?: string | null
) =>
  db.transaction().execute(async (tx) => {
    const floor = await tx
      .selectFrom('floors')
      .select(['id', 'current_map_revision_id'])
      .where('id', '=', floorId)
      .where('organization_id', '=', organizationId)
      .forShare()
      .executeTakeFirst()
    if (!floor) return []
    const revision = await findMapRevision(
      floorId,
      organizationId,
      revisionId ?? floor.current_map_revision_id,
      tx
    )
    if (!revision) return []
    if (revision.archived_beacons !== null) {
      const rows = revision.archived_beacons as unknown as Beacon[]
      return rows
        .filter((b) => b.enabled && b.deleted_at === null)
        .map((b) => ({
          ...b,
          created_at: new Date(b.created_at),
          updated_at: new Date(b.updated_at),
        }))
    }
    return tx
      .selectFrom('beacons')
      .selectAll()
      .where('floor_id', '=', floorId)
      .where('enabled', '=', true)
      .where('deleted_at', 'is', null)
      .execute()
  })
