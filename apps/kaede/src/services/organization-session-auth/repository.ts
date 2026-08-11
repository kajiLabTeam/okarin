import type { Insertable } from 'kysely'
import type { AuthenticationEvents } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const findCurrentMembershipForSessionLogout = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_memberships')
    .select(['id', 'organization_id', 'user_id', 'status'])
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['active', 'suspended'])
    .executeTakeFirst()

export const revokeCurrentSessionMembershipGrant = async (
  sessionId: string,
  membershipId: string,
  userId: string,
  revokedAt: Date,
  executor: DbExecutor
) => {
  const result = await executor
    .updateTable('session_membership_authentications')
    .set({ revoked_at: revokedAt, updated_at: revokedAt })
    .where('session_id', '=', sessionId)
    .where('membership_id', '=', membershipId)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()

  return result.numUpdatedRows > 0n
}

export const insertOrganizationSessionAuthenticationEvent = async (
  event: Insertable<AuthenticationEvents>,
  executor: DbExecutor
) => executor.insertInto('authentication_events').values(event).executeTakeFirst()
