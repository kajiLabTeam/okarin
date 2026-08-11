import type { Insertable, Updateable } from 'kysely'
import type { AuditEvents, OrganizationMemberships } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const lockOrganizationForMembershipAdministration = async (
  organizationId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organizations')
    .select('id')
    .where('id', '=', organizationId)
    .forUpdate()
    .executeTakeFirst()

export const findCurrentMembershipByUserForUpdate = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['active', 'suspended'])
    .forUpdate()
    .executeTakeFirst()

export const findMembershipByIdForUpdate = async (
  organizationId: string,
  membershipId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', membershipId)
    .forUpdate()
    .executeTakeFirst()

export const countActiveOwners = async (organizationId: string, executor: DbExecutor) => {
  const row = await executor
    .selectFrom('organization_memberships')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('organization_id', '=', organizationId)
    .where('role', '=', 'owner')
    .where('status', '=', 'active')
    .executeTakeFirstOrThrow()
  return Number.parseInt(row.count.toString(), 10)
}

export const updateManagedMembership = async (
  membershipId: string,
  values: Updateable<OrganizationMemberships>,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_memberships')
    .set(values)
    .where('id', '=', membershipId)
    .returningAll()
    .executeTakeFirstOrThrow()

export const revokeAllMembershipGrants = async (
  membershipId: string,
  revokedAt: Date,
  executor: DbExecutor
) =>
  executor
    .updateTable('session_membership_authentications')
    .set({ revoked_at: revokedAt, updated_at: revokedAt })
    .where('membership_id', '=', membershipId)
    .where('revoked_at', 'is', null)
    .execute()

export const revokeMembershipAuthenticationSources = async (
  membershipId: string,
  revokedAt: Date,
  executor: DbExecutor
) => {
  await executor
    .updateTable('organization_local_credentials')
    .set({ enabled: false, updated_at: revokedAt })
    .where('membership_id', '=', membershipId)
    .where('enabled', '=', true)
    .execute()
  await executor
    .updateTable('organization_member_oidc_identities')
    .set({ revoked_at: revokedAt })
    .where('membership_id', '=', membershipId)
    .where('revoked_at', 'is', null)
    .execute()
}

export const insertMembershipAdministrationAuditEvent = async (
  event: Insertable<AuditEvents>,
  executor: DbExecutor
) => executor.insertInto('audit_events').values(event).executeTakeFirst()
