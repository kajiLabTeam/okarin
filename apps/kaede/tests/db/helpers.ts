import { sql } from 'kysely'
import { createDb } from '../../src/services/db/client.js'

export const createTestDb = () => createDb()

export const resetDatabase = async () => {
  const db = createTestDb()

  try {
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
  } finally {
    await db.destroy()
  }
}
