import { sql } from 'kysely'
import type { Insertable, Selectable } from 'kysely'
import type {
  OrganizationInvites,
  OrganizationLocalCredentials,
  OrganizationMemberships,
} from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type OrganizationInvite = Selectable<OrganizationInvites>

export const findActorMembershipForUpdate = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) => {
  return executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['active', 'suspended'])
    .forUpdate()
    .executeTakeFirst()
}

export const findActorMembership = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
) => {
  return executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['active', 'suspended'])
    .executeTakeFirst()
}

export const insertOrganizationInvite = async (
  invite: Insertable<OrganizationInvites>,
  executor: DbExecutor
): Promise<OrganizationInvite> => {
  return executor
    .insertInto('organization_invites')
    .values(invite)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const listOrganizationInvites = async (
  organizationId: string,
  roles: ('member' | 'manager')[],
  executor: DbExecutor = db
): Promise<OrganizationInvite[]> => {
  return executor
    .selectFrom('organization_invites')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('role', 'in', roles)
    .orderBy('created_at', 'desc')
    .execute()
}

export const findOrganizationInviteForUpdate = async (
  organizationId: string,
  inviteId: string,
  executor: DbExecutor
): Promise<OrganizationInvite | undefined> => {
  return executor
    .selectFrom('organization_invites')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', inviteId)
    .forUpdate()
    .executeTakeFirst()
}

export const revokeOrganizationInvite = async (
  inviteId: string,
  revokedAt: Date,
  executor: DbExecutor
) => {
  return executor
    .updateTable('organization_invites')
    .set({ revoked_at: revokedAt })
    .where('id', '=', inviteId)
    .where('redeemed_at', 'is', null)
    .where('revoked_at', 'is', null)
    .returningAll()
    .executeTakeFirst()
}

const inviteContextQuery = (executor: DbExecutor) =>
  executor
    .selectFrom('organization_invites as invite')
    .innerJoin('organizations as organization', 'organization.id', 'invite.organization_id')
    .leftJoin(
      'organization_auth_settings as auth_settings',
      'auth_settings.organization_id',
      'organization.id'
    )
    .select([
      'invite.id as invite_id',
      'invite.organization_id',
      'invite.role',
      'invite.expires_at',
      'invite.revoked_at',
      'invite.redeemed_at',
      'organization.name as organization_name',
      'organization.status as organization_status',
      'auth_settings.local_auth_enabled',
      'auth_settings.oidc_auth_enabled',
      'auth_settings.policy_version',
      'auth_settings.membership_grant_ttl_seconds',
    ])

export const findInviteContextByTokenHash = async (
  tokenHash: string,
  executor: DbExecutor = db
) => {
  return inviteContextQuery(executor).where('invite.token_hash', '=', tokenHash).executeTakeFirst()
}

export const findInviteContextByTokenHashForUpdate = async (
  tokenHash: string,
  executor: DbExecutor
) => {
  return inviteContextQuery(executor)
    .where('invite.token_hash', '=', tokenHash)
    .forUpdate('invite')
    .executeTakeFirst()
}

export const findMembershipStateForInvite = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) => {
  return executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .orderBy(
      sql<number>`CASE status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END`,
      'asc'
    )
    .orderBy('joined_at', 'desc')
    .forUpdate()
    .executeTakeFirst()
}

export const findEnabledLocalCredentialByEmail = async (
  organizationId: string,
  normalizedLoginEmail: string,
  executor: DbExecutor
) => {
  return executor
    .selectFrom('organization_local_credentials')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('normalized_login_email', '=', normalizedLoginEmail)
    .where('enabled', '=', true)
    .executeTakeFirst()
}

export const insertOrganizationMembershipForInvite = async (
  membership: Insertable<OrganizationMemberships>,
  executor: DbExecutor
) => {
  return executor
    .insertInto('organization_memberships')
    .values(membership)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertOrganizationLocalCredential = async (
  credential: Insertable<OrganizationLocalCredentials>,
  executor: DbExecutor
) => {
  return executor
    .insertInto('organization_local_credentials')
    .values(credential)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const consumeOrganizationInvite = async (
  inviteId: string,
  membershipId: string,
  consumedAt: Date,
  executor: DbExecutor
) => {
  return executor
    .updateTable('organization_invites')
    .set({
      redeemed_at: consumedAt,
      redeemed_membership_id: membershipId,
      used_count: 1,
    })
    .where('id', '=', inviteId)
    .where('redeemed_at', 'is', null)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', consumedAt)
    .returningAll()
    .executeTakeFirst()
}
