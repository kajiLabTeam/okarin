import type { Insertable, Selectable } from 'kysely'
import type {
  AuthenticationEvents,
  OrganizationLocalCredentials,
  SessionMembershipAuthentications,
} from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type OrganizationLocalCredential = Selectable<OrganizationLocalCredentials>

export const normalizeLocalLoginEmail = (email: string) => email.trim().toLowerCase()

export const findOrganizationLocalAuthPolicyBySlug = async (
  organizationSlug: string,
  executor: DbExecutor = db
) => {
  return executor
    .selectFrom('organizations as organization')
    .innerJoin(
      'organization_auth_settings as auth_settings',
      'auth_settings.organization_id',
      'organization.id'
    )
    .select([
      'organization.id as organization_id',
      'organization.status as organization_status',
      'auth_settings.local_auth_enabled',
      'auth_settings.policy_version',
      'auth_settings.membership_grant_ttl_seconds',
    ])
    .where('organization.slug', '=', organizationSlug)
    .executeTakeFirst()
}

export const findLocalCredentialContextForUpdate = async (
  organizationId: string,
  normalizedLoginEmail: string,
  executor: DbExecutor
) => {
  return executor
    .selectFrom('organization_local_credentials as credential')
    .innerJoin(
      'organization_memberships as membership',
      'membership.id',
      'credential.membership_id'
    )
    .innerJoin('users as user', 'user.id', 'membership.user_id')
    .select([
      'credential.id as credential_id',
      'credential.membership_id',
      'credential.organization_id',
      'credential.password_hash',
      'credential.failed_login_attempts',
      'credential.locked_until',
      'credential.enabled as credential_enabled',
      'membership.user_id',
      'membership.role as membership_role',
      'membership.status as membership_status',
      'user.status as user_status',
    ])
    .where('credential.organization_id', '=', organizationId)
    .where('credential.normalized_login_email', '=', normalizedLoginEmail)
    .where('credential.enabled', '=', true)
    .forUpdate()
    .executeTakeFirst()
}

export const updateLocalCredentialAttempts = async (
  credentialId: string,
  values: { failed_login_attempts: number; locked_until: Date | null },
  executor: DbExecutor
) => {
  return executor
    .updateTable('organization_local_credentials')
    .set(values)
    .where('id', '=', credentialId)
    .executeTakeFirst()
}

export const hasLocalAuthenticationGrantBySessionId = async (
  sessionId: string,
  executor: DbExecutor = db
) => {
  const grant = await executor
    .selectFrom('session_membership_authentications')
    .select('session_id')
    .where('session_id', '=', sessionId)
    .where('auth_method', '=', 'local')
    .executeTakeFirst()

  return grant !== undefined
}

export const upsertLocalMembershipGrant = async (
  grant: Insertable<SessionMembershipAuthentications>,
  executor: DbExecutor
) => {
  return executor
    .insertInto('session_membership_authentications')
    .values(grant)
    .onConflict((oc) =>
      oc.columns(['session_id', 'membership_id']).doUpdateSet({
        user_id: grant.user_id,
        auth_method: grant.auth_method,
        policy_version: grant.policy_version,
        local_credential_id: grant.local_credential_id,
        member_oidc_identity_id: null,
        authenticated_at: grant.authenticated_at,
        expires_at: grant.expires_at,
        revoked_at: null,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertAuthenticationEvent = async (
  event: Insertable<AuthenticationEvents>,
  executor: DbExecutor
) => {
  return executor
    .insertInto('authentication_events')
    .values(event)
    .returningAll()
    .executeTakeFirstOrThrow()
}
