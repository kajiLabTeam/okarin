import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type MembershipGrantAuthMethod = 'local' | 'oidc'

export interface MembershipGrantContext {
  organization_id: string
  membership_id: string
  membership_role: string
  membership_status: string | null
  membership_left_at: Date | null
  organization_status: string | null
  local_auth_enabled: boolean
  oidc_auth_enabled: boolean
  current_policy_version: string
  reauthentication_interval_seconds: number
  grant_auth_method: string | null
  grant_policy_version: string | null
  grant_authenticated_at: Date | null
  grant_expires_at: Date | null
  grant_revoked_at: Date | null
  local_credential_enabled: boolean | null
  oidc_identity_revoked_at: Date | null
  oidc_provider_enabled: boolean | null
}

const membershipGrantContextQuery = (sessionId: string, userId: string, executor: DbExecutor) =>
  executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('organizations as organization', 'organization.id', 'membership.organization_id')
    .innerJoin(
      'organization_auth_settings as auth_settings',
      'auth_settings.organization_id',
      'membership.organization_id'
    )
    .leftJoin('session_membership_authentications as grant', (join) =>
      join
        .onRef('grant.membership_id', '=', 'membership.id')
        .on('grant.session_id', '=', sessionId)
        .on('grant.user_id', '=', userId)
    )
    .leftJoin('organization_local_credentials as local_credential', (join) =>
      join
        .onRef('local_credential.id', '=', 'grant.local_credential_id')
        .onRef('local_credential.membership_id', '=', 'membership.id')
    )
    .leftJoin('organization_member_oidc_identities as oidc_identity', (join) =>
      join
        .onRef('oidc_identity.id', '=', 'grant.member_oidc_identity_id')
        .onRef('oidc_identity.membership_id', '=', 'membership.id')
    )
    .leftJoin('organization_oidc_providers as oidc_provider', (join) =>
      join.onRef('oidc_provider.id', '=', 'oidc_identity.organization_oidc_provider_id')
    )
    .select([
      'membership.organization_id',
      'membership.id as membership_id',
      'membership.role as membership_role',
      'membership.status as membership_status',
      'membership.left_at as membership_left_at',
      'organization.status as organization_status',
      'auth_settings.local_auth_enabled',
      'auth_settings.oidc_auth_enabled',
      'auth_settings.policy_version as current_policy_version',
      'auth_settings.reauthentication_interval_seconds',
      'grant.auth_method as grant_auth_method',
      'grant.policy_version as grant_policy_version',
      'grant.authenticated_at as grant_authenticated_at',
      'grant.expires_at as grant_expires_at',
      'grant.revoked_at as grant_revoked_at',
      'local_credential.enabled as local_credential_enabled',
      'oidc_identity.revoked_at as oidc_identity_revoked_at',
      'oidc_provider.enabled as oidc_provider_enabled',
    ])
    .where('membership.user_id', '=', userId)
    .where('membership.status', 'in', ['active', 'suspended'])

export const findMembershipGrantContext = async (
  sessionId: string,
  userId: string,
  organizationId: string,
  executor: DbExecutor = db
): Promise<MembershipGrantContext | undefined> => {
  const context = await membershipGrantContextQuery(sessionId, userId, executor)
    .where('membership.organization_id', '=', organizationId)
    .executeTakeFirst()

  if (!context?.membership_id) return undefined
  return { ...context, membership_id: context.membership_id }
}

export const listMembershipGrantContexts = async (
  sessionId: string,
  userId: string,
  executor: DbExecutor = db
): Promise<MembershipGrantContext[]> => {
  const contexts = await membershipGrantContextQuery(sessionId, userId, executor)
    .orderBy('organization_id', 'asc')
    .execute()

  return contexts.filter(
    (context): context is MembershipGrantContext => context.membership_id !== null
  )
}
