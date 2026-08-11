import type { Insertable, Updateable } from 'kysely'
import type { AuditEvents, OrganizationLocalCredentials } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const findLocalCredentialMembershipContext = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db,
  lock = false
) => {
  let query = executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('organizations as organization', 'organization.id', 'membership.organization_id')
    .innerJoin(
      'organization_auth_settings as settings',
      'settings.organization_id',
      'organization.id'
    )
    .select([
      'membership.id as membership_id',
      'membership.organization_id',
      'membership.user_id',
      'settings.local_auth_enabled',
      'settings.policy_version',
      'settings.reauthentication_interval_seconds',
    ])
    .where('membership.organization_id', '=', organizationId)
    .where('membership.user_id', '=', userId)
    .where('membership.status', '=', 'active')
    .where('organization.status', '=', 'active')

  if (lock) query = query.forUpdate('membership')
  return query.executeTakeFirst()
}

export const findLocalCredentialByMembership = async (
  membershipId: string,
  executor: DbExecutor = db,
  lock = false
) => {
  let query = executor
    .selectFrom('organization_local_credentials')
    .selectAll()
    .where('membership_id', '=', membershipId)

  if (lock) query = query.forUpdate()
  return query.executeTakeFirst()
}

export const findRecentCredentialManagementGrant = async (
  sessionId: string,
  membershipId: string,
  userId: string,
  policyVersion: string,
  reauthenticatedAfter: Date,
  now: Date,
  executor: DbExecutor
) =>
  executor
    .selectFrom('session_membership_authentications')
    .select('session_id')
    .where('session_id', '=', sessionId)
    .where('membership_id', '=', membershipId)
    .where('user_id', '=', userId)
    .where('policy_version', '=', policyVersion)
    .where('authenticated_at', '>=', reauthenticatedAfter)
    .where('expires_at', '>', now)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()

export const findRecentUserSession = async (
  sessionId: string,
  userId: string,
  authenticatedAfter: Date,
  now: Date,
  executor: DbExecutor
) =>
  executor
    .selectFrom('sessions')
    .select('id')
    .where('id', '=', sessionId)
    .where('user_id', '=', userId)
    .where('created_at', '>=', authenticatedAfter)
    .where('expires_at', '>', now)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()

export const hasUsableOidcLink = async (
  membershipId: string,
  organizationId: string,
  executor: DbExecutor
) => {
  const link = await executor
    .selectFrom('organization_member_oidc_identities as link')
    .innerJoin(
      'organization_oidc_providers as provider',
      'provider.id',
      'link.organization_oidc_provider_id'
    )
    .innerJoin(
      'organization_auth_settings as settings',
      'settings.organization_id',
      'link.organization_id'
    )
    .select('link.id')
    .where('link.membership_id', '=', membershipId)
    .where('link.organization_id', '=', organizationId)
    .where('link.revoked_at', 'is', null)
    .where('provider.enabled', '=', true)
    .where('settings.oidc_auth_enabled', '=', true)
    .executeTakeFirst()
  return link !== undefined
}

export const findEnabledLocalCredentialByNormalizedEmail = async (
  organizationId: string,
  normalizedLoginEmail: string,
  excludedCredentialId: string | undefined,
  executor: DbExecutor
) => {
  let query = executor
    .selectFrom('organization_local_credentials')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('normalized_login_email', '=', normalizedLoginEmail)
    .where('enabled', '=', true)

  if (excludedCredentialId) query = query.where('id', '!=', excludedCredentialId)
  return query.executeTakeFirst()
}

export const insertManagedLocalCredential = async (
  credential: Insertable<OrganizationLocalCredentials>,
  executor: DbExecutor
) =>
  executor
    .insertInto('organization_local_credentials')
    .values(credential)
    .returningAll()
    .executeTakeFirstOrThrow()

export const updateManagedLocalCredential = async (
  credentialId: string,
  values: Updateable<OrganizationLocalCredentials>,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_local_credentials')
    .set(values)
    .where('id', '=', credentialId)
    .returningAll()
    .executeTakeFirstOrThrow()

export const revokeGrantsFromLocalCredential = async (
  credentialId: string,
  revokedAt: Date,
  executor: DbExecutor
) =>
  executor
    .updateTable('session_membership_authentications')
    .set({ revoked_at: revokedAt, updated_at: revokedAt })
    .where('local_credential_id', '=', credentialId)
    .where('auth_method', '=', 'local')
    .where('revoked_at', 'is', null)
    .executeTakeFirst()

export const insertLocalCredentialAuditEvent = async (
  event: Insertable<AuditEvents>,
  executor: DbExecutor
) => executor.insertInto('audit_events').values(event).executeTakeFirst()
