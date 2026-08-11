import { sql } from 'kysely'
import type { Insertable } from 'kysely'
import type {
  AuditEvents,
  AuthenticationEvents,
  OidcIdentities,
  OidcLoginTransactions,
  OrganizationMemberOidcIdentities,
  OrganizationOidcProviders,
  SessionMembershipAuthentications,
} from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const findOrganizationOidcProviderContext = async (
  organizationSlug: string,
  providerId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_oidc_providers as provider')
    .innerJoin('organizations as organization', 'organization.id', 'provider.organization_id')
    .innerJoin(
      'organization_auth_settings as settings',
      'settings.organization_id',
      'organization.id'
    )
    .select([
      'provider.id as provider_id',
      'provider.organization_id',
      'provider.name as provider_name',
      'provider.issuer',
      'provider.client_id',
      'provider.scopes',
      'provider.allowed_hosted_domains',
      'provider.enabled as provider_enabled',
      'organization.status as organization_status',
      'settings.oidc_auth_enabled',
      'settings.policy_version',
      'settings.membership_grant_ttl_seconds',
      'settings.reauthentication_interval_seconds',
    ])
    .where('organization.slug', '=', organizationSlug)
    .where('provider.id', '=', providerId)
    .executeTakeFirst()

export const findOrganizationOidcProviderContextById = async (
  providerId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_oidc_providers as provider')
    .innerJoin('organizations as organization', 'organization.id', 'provider.organization_id')
    .innerJoin(
      'organization_auth_settings as settings',
      'settings.organization_id',
      'organization.id'
    )
    .select([
      'provider.id as provider_id',
      'provider.organization_id',
      'provider.name as provider_name',
      'provider.issuer',
      'provider.client_id',
      'provider.scopes',
      'provider.allowed_hosted_domains',
      'provider.enabled as provider_enabled',
      'organization.status as organization_status',
      'settings.oidc_auth_enabled',
      'settings.policy_version',
      'settings.membership_grant_ttl_seconds',
      'settings.reauthentication_interval_seconds',
    ])
    .where('provider.id', '=', providerId)
    .executeTakeFirst()

export const insertOidcLoginTransaction = async (
  transaction: Insertable<OidcLoginTransactions>,
  executor: DbExecutor = db
) =>
  executor
    .insertInto('oidc_login_transactions')
    .values(transaction)
    .returningAll()
    .executeTakeFirstOrThrow()

export const claimOidcLoginTransaction = async (
  stateHash: string,
  now: Date,
  executor: DbExecutor = db
) =>
  executor
    .updateTable('oidc_login_transactions')
    .set({ consumed_at: now })
    .where('state_hash', '=', stateHash)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', now)
    .returningAll()
    .executeTakeFirst()

export const oidcLoginTransactionStateExists = async (
  stateHash: string,
  executor: DbExecutor = db
) =>
  Boolean(
    await executor
      .selectFrom('oidc_login_transactions')
      .select('id')
      .where('state_hash', '=', stateHash)
      .executeTakeFirst()
  )

export const findActiveInviteIdByTokenHash = async (
  organizationId: string,
  tokenHash: string,
  now: Date,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_invites')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('token_hash', '=', tokenHash)
    .where('revoked_at', 'is', null)
    .where('redeemed_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst()

export const findActiveMembershipByOrganizationAndUser = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .executeTakeFirst()

export const findValidSessionById = async (
  sessionId: string,
  now: Date,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('sessions')
    .selectAll()
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst()

export const findRecentMembershipGrant = async (
  sessionId: string,
  organizationId: string,
  userId: string,
  policyVersion: string,
  reauthenticatedAfter: Date,
  now: Date,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('session_membership_authentications as grant')
    .innerJoin('organization_memberships as membership', 'membership.id', 'grant.membership_id')
    .select(['grant.session_id', 'grant.membership_id'])
    .where('grant.session_id', '=', sessionId)
    .where('grant.user_id', '=', userId)
    .where('membership.organization_id', '=', organizationId)
    .where('membership.status', '=', 'active')
    .where('grant.policy_version', '=', policyVersion)
    .where('grant.authenticated_at', '>=', reauthenticatedAfter)
    .where('grant.expires_at', '>', now)
    .where('grant.revoked_at', 'is', null)
    .executeTakeFirst()

export const findOidcIdentity = async (
  issuer: string,
  subject: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('oidc_identities')
    .selectAll()
    .where('issuer', '=', issuer)
    .where('subject', '=', subject)
    .executeTakeFirst()

export const insertOidcIdentity = async (
  identity: Insertable<OidcIdentities>,
  executor: DbExecutor
) =>
  executor.insertInto('oidc_identities').values(identity).returningAll().executeTakeFirstOrThrow()

export const updateOidcIdentityClaims = async (
  identityId: string,
  values: { last_claimed_email: string | null; last_claimed_email_verified: boolean | null },
  executor: DbExecutor
) =>
  executor
    .updateTable('oidc_identities')
    .set(values)
    .where('id', '=', identityId)
    .returningAll()
    .executeTakeFirstOrThrow()

export const findActiveOidcMembershipLink = async (
  providerId: string,
  identityId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_member_oidc_identities as link')
    .innerJoin('organization_memberships as membership', 'membership.id', 'link.membership_id')
    .innerJoin('users as user', 'user.id', 'link.user_id')
    .select([
      'link.id as link_id',
      'link.membership_id',
      'link.organization_id',
      'link.user_id',
      'membership.role as membership_role',
      'membership.status as membership_status',
      'user.status as user_status',
    ])
    .where('link.organization_oidc_provider_id', '=', providerId)
    .where('link.oidc_identity_id', '=', identityId)
    .where('link.revoked_at', 'is', null)
    .executeTakeFirst()

export const revokeActiveOidcMembershipLink = async (
  providerId: string,
  identityId: string,
  revokedAt: Date,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_member_oidc_identities')
    .set({ revoked_at: revokedAt })
    .where('organization_oidc_provider_id', '=', providerId)
    .where('oidc_identity_id', '=', identityId)
    .where('revoked_at', 'is', null)
    .returningAll()
    .executeTakeFirst()

export const upsertOidcMembershipLink = async (
  link: Insertable<OrganizationMemberOidcIdentities>,
  executor: DbExecutor
) => {
  const existing = await executor
    .selectFrom('organization_member_oidc_identities')
    .selectAll()
    .where('membership_id', '=', link.membership_id)
    .where('organization_oidc_provider_id', '=', link.organization_oidc_provider_id)
    .where('oidc_identity_id', '=', link.oidc_identity_id)
    .executeTakeFirst()

  if (existing) {
    return executor
      .updateTable('organization_member_oidc_identities')
      .set({ revoked_at: null })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return executor
    .insertInto('organization_member_oidc_identities')
    .values(link)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const upsertOidcMembershipGrant = async (
  grant: Insertable<SessionMembershipAuthentications>,
  executor: DbExecutor
) =>
  executor
    .insertInto('session_membership_authentications')
    .values(grant)
    .onConflict((oc) =>
      oc.columns(['session_id', 'membership_id']).doUpdateSet({
        user_id: grant.user_id,
        auth_method: 'oidc',
        policy_version: grant.policy_version,
        local_credential_id: null,
        member_oidc_identity_id: grant.member_oidc_identity_id,
        authenticated_at: grant.authenticated_at,
        expires_at: grant.expires_at,
        revoked_at: null,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow()

export const insertOidcAuthenticationEvent = async (
  event: Insertable<AuthenticationEvents>,
  executor: DbExecutor
) =>
  executor
    .insertInto('authentication_events')
    .values(event)
    .returningAll()
    .executeTakeFirstOrThrow()

export const insertOidcAuditEvent = async (event: Insertable<AuditEvents>, executor: DbExecutor) =>
  executor.insertInto('audit_events').values(event).executeTakeFirst()

export const listOidcProviders = async (organizationId: string, executor: DbExecutor = db) =>
  executor
    .selectFrom('organization_oidc_providers')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('created_at', 'asc')
    .execute()

export const insertOidcProvider = async (
  provider: Insertable<OrganizationOidcProviders>,
  executor: DbExecutor
) =>
  executor
    .insertInto('organization_oidc_providers')
    .values(provider)
    .returningAll()
    .executeTakeFirstOrThrow()

export const updateOidcProvider = async (
  organizationId: string,
  providerId: string,
  provider: Partial<Insertable<OrganizationOidcProviders>>,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_oidc_providers')
    .set(provider)
    .where('organization_id', '=', organizationId)
    .where('id', '=', providerId)
    .returningAll()
    .executeTakeFirst()

export const findActiveOwnerMembershipForUpdate = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('status', '=', 'active')
    .forUpdate()
    .executeTakeFirst()

export const incrementOrganizationPolicyVersion = async (
  organizationId: string,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_auth_settings')
    .set({ policy_version: sql`policy_version + 1` })
    .where('organization_id', '=', organizationId)
    .returningAll()
    .executeTakeFirstOrThrow()
