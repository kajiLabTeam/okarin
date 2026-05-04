import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { DB } from '../../src/services/db/generated.js'

export const resetDatabase = async (db: Kysely<DB>) => {
  await sql`
    TRUNCATE TABLE
      trajectory_constraints,
      trajectories,
      recordings,
      pedestrians,
      floors,
      buildings
    RESTART IDENTITY CASCADE
  `.execute(db)
}
