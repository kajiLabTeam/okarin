import { db } from '../services/db/index.js'
import { extractFloorMapDimensions } from '../services/floor-maps/dimensions.js'
import { getFloorMapObjectBytes } from '../services/storage/index.js'

// SQL cannot read object storage. Run after the schema migration; failures are
// reported individually and remain nullable rather than inventing dimensions.
const execute = process.argv.includes('--execute')
let failures = 0
try {
  const revisions = await db
    .selectFrom('floor_map_revisions')
    .selectAll()
    .where('map_width_px', 'is', null)
    .execute()
  for (const revision of revisions) {
    try {
      const bytes = await getFloorMapObjectBytes(revision.image_object_path)
      if (!bytes) throw new Error('Image object unavailable')
      const dimensions = extractFloorMapDimensions(
        bytes,
        revision.image_object_path.endsWith('.svg') ? 'svg' : 'png'
      )
      if (!dimensions) throw new Error('Unsupported or invalid image dimensions')
      if (execute)
        await db.transaction().execute(async (tx) => {
          await tx
            .updateTable('floor_map_revisions')
            .set({ map_width_px: dimensions.width, map_height_px: dimensions.height })
            .where('id', '=', revision.id)
            .where('map_width_px', 'is', null)
            .execute()
          await tx
            .updateTable('floors')
            .set({ map_width_px: dimensions.width, map_height_px: dimensions.height })
            .where('current_map_revision_id', '=', revision.id)
            .where('map_width_px', 'is', null)
            .execute()
        })
      console.log(
        JSON.stringify({
          revision_id: revision.id,
          status: execute ? 'updated' : 'dry_run',
          ...dimensions,
        })
      )
    } catch (error) {
      failures++
      console.error(
        JSON.stringify({
          revision_id: revision.id,
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }
} finally {
  await db.destroy()
}
process.exitCode = failures > 0 ? 1 : 0
