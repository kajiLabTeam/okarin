import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { DB } from '../../src/services/db/generated.js'

export const resetDatabase = async (db: Kysely<DB>) => {
  await sql`
    TRUNCATE TABLE
      application_data_migrations,
      audit_events,
      authentication_events,
      oidc_login_transactions,
      session_membership_authentications,
      organization_member_oidc_identities,
      oidc_identities,
      organization_local_credentials,
      organization_oidc_providers,
      organization_auth_settings,
      organization_member_profiles,
      user_profiles,
      sessions,
      organization_invite_redemptions,
      organization_invites,
      organization_creation_requests,
      auth_identities,
      organization_memberships,
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
