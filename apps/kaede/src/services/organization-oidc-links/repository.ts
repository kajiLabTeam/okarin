import { sql } from 'kysely'
import type { Insertable } from 'kysely'
import type { AuditEvents, AuthenticationEvents } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

const activeMembershipQuery = (executor: DbExecutor) =>
  executor.selectFrom('organization_memberships').selectAll().where('status', '=', 'active')

export const findActiveMembership = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
) =>
  activeMembershipQuery(executor)
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .executeTakeFirst()

export const findActiveMembershipForUpdate = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) =>
  activeMembershipQuery(executor)
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .forUpdate()
    .executeTakeFirst()

export const listActiveOrganizationOidcLinks = async (
  membershipId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_member_oidc_identities as link')
    .innerJoin(
      'organization_oidc_providers as provider',
      'provider.id',
      'link.organization_oidc_provider_id'
    )
    .select([
      'link.id',
      'link.created_at as linked_at',
      'provider.id as provider_id',
      'provider.name as provider_name',
      'provider.enabled as provider_enabled',
    ])
    .where('link.membership_id', '=', membershipId)
    .where('link.revoked_at', 'is', null)
    .orderBy('link.created_at', 'asc')
    .execute()

export const findOrganizationAuthSettingsForUpdate = async (
  organizationId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_auth_settings')
    .select(['local_auth_enabled', 'oidc_auth_enabled'])
    .where('organization_id', '=', organizationId)
    .forUpdate()
    .executeTakeFirst()

export const findActiveOrganizationOidcLinkForUpdate = async (
  organizationId: string,
  membershipId: string,
  linkId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_member_oidc_identities as link')
    .innerJoin(
      'organization_oidc_providers as provider',
      'provider.id',
      'link.organization_oidc_provider_id'
    )
    .select([
      'link.id',
      'link.oidc_identity_id',
      'link.organization_oidc_provider_id as provider_id',
      'provider.enabled as provider_enabled',
    ])
    .where('link.id', '=', linkId)
    .where('link.organization_id', '=', organizationId)
    .where('link.membership_id', '=', membershipId)
    .where('link.revoked_at', 'is', null)
    .forUpdate('link')
    .executeTakeFirst()

export const hasEnabledLocalCredential = async (
  membershipId: string,
  executor: DbExecutor
): Promise<boolean> =>
  Boolean(
    await executor
      .selectFrom('organization_local_credentials')
      .select('id')
      .where('membership_id', '=', membershipId)
      .where('enabled', '=', true)
      .executeTakeFirst()
  )

export const countOtherUsableOidcLinks = async (
  membershipId: string,
  excludedLinkId: string,
  executor: DbExecutor
): Promise<number> => {
  const result = await executor
    .selectFrom('organization_member_oidc_identities as link')
    .innerJoin(
      'organization_oidc_providers as provider',
      'provider.id',
      'link.organization_oidc_provider_id'
    )
    .select(sql<number>`count(*)::integer`.as('count'))
    .where('link.membership_id', '=', membershipId)
    .where('link.id', '!=', excludedLinkId)
    .where('link.revoked_at', 'is', null)
    .where('provider.enabled', '=', true)
    .executeTakeFirstOrThrow()
  return result.count
}

export const revokeOrganizationOidcLink = async (
  linkId: string,
  revokedAt: Date,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_member_oidc_identities')
    .set({ revoked_at: revokedAt })
    .where('id', '=', linkId)
    .where('revoked_at', 'is', null)
    .returningAll()
    .executeTakeFirst()

export const revokeActiveGrantsForOidcLink = async (
  membershipId: string,
  linkId: string,
  revokedAt: Date,
  executor: DbExecutor
) => {
  const result = await executor
    .updateTable('session_membership_authentications')
    .set({ revoked_at: revokedAt, updated_at: revokedAt })
    .where('membership_id', '=', membershipId)
    .where('member_oidc_identity_id', '=', linkId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}

export const insertOidcLinkAuditEvent = async (
  event: Insertable<AuditEvents>,
  executor: DbExecutor
) => executor.insertInto('audit_events').values(event).executeTakeFirst()

export const insertOidcLinkAuthenticationEvent = async (
  event: Insertable<AuthenticationEvents>,
  executor: DbExecutor
) => executor.insertInto('authentication_events').values(event).executeTakeFirst()
