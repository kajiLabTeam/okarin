import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { DB } from '../../src/services/db/generated.js'

export const resetDatabase = async (db: Kysely<DB>) => {
  await sql`
    TRUNCATE TABLE
      sessions,
      organization_invite_redemptions,
      organization_invites,
      organization_creation_requests,
      auth_identities,
      organization_memberships,
      trajectory_constraints,
      trajectories,
      recordings,
      pedestrians,
      floors,
      buildings,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `.execute(db)
}
