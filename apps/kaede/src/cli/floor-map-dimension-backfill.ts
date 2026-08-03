import { extractFloorMapDimensions } from '../services/floor-maps/dimensions.js'
import { backfillFloorMapDimensions, listFloorMapDimensionRows } from '../services/floors/index.js'
import {
  getFloorMapExtensionFromObjectKey,
  getFloorMapObjectBytes,
} from '../services/storage/index.js'

interface Options {
  command: 'backfill' | 'verify'
  floorId?: string
}

const usage = (): never => {
  throw new Error('usage: floor-map-dimension-backfill <backfill|verify> [--floor-id UUID]')
}

export const parseOptions = (argv: string[]): Options => {
  const command = argv.shift()
  if (command !== 'backfill' && command !== 'verify') usage()
  const options: Options = { command: command as Options['command'] }
  while (argv.length > 0) {
    const flag = argv.shift()
    if (flag === '--floor-id') options.floorId = argv.shift() ?? usage()
    else usage()
  }
  return options
}

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseOptions([...argv])
  const rows = await listFloorMapDimensionRows(options.floorId)
  if (options.floorId && rows.length === 0) throw new Error('floor does not exist')
  let failed = 0
  let updated = 0
  let verified = 0

  for (const row of rows) {
    try {
      const extension = getFloorMapExtensionFromObjectKey(row.image_object_path)
      if (!extension) throw new Error('unsupported floor map extension')
      const bytes = await getFloorMapObjectBytes(row.image_object_path)
      if (!bytes) throw new Error('floor map object does not exist')
      const dimensions = extractFloorMapDimensions(bytes, extension)
      if (!dimensions) throw new Error('floor map dimensions are invalid')

      if (row.map_width_px === null && row.map_height_px === null) {
        if (options.command === 'verify') throw new Error('floor map dimensions are not stored')
        const changed = await backfillFloorMapDimensions(
          row.id,
          dimensions.width,
          dimensions.height
        )
        if (!changed) throw new Error('floor map dimensions were updated concurrently')
        updated += 1
        process.stdout.write(
          `${JSON.stringify({ floor_id: row.id, status: 'updated', ...dimensions })}\n`
        )
      } else if (row.map_width_px !== dimensions.width || row.map_height_px !== dimensions.height) {
        throw new Error('stored dimensions do not match floor map object')
      } else {
        verified += 1
        process.stdout.write(
          `${JSON.stringify({ floor_id: row.id, status: 'verified', ...dimensions })}\n`
        )
      }
    } catch (error) {
      failed += 1
      process.stdout.write(
        `${JSON.stringify({ floor_id: row.id, status: 'failed', message: error instanceof Error ? error.message : String(error) })}\n`
      )
    }
  }

  process.stdout.write(`${JSON.stringify({ resources: rows.length, updated, verified, failed })}\n`)
  if (failed > 0) throw new Error(`floor map dimension migration failed for ${failed} resource(s)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
