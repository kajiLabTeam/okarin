import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  DisableOrganizationLocalCredentialRequest,
  PutOrganizationLocalCredentialRequest,
} from '../../schemas/organization-local-credentials.js'
import { hashPassword, verifyPassword } from '../../services/auth/index.js'
import type { Json } from '../../services/db/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import { normalizeLocalLoginEmail } from '../../services/organization-local-auth/index.js'
import {
  findEnabledLocalCredentialByNormalizedEmail,
  findLocalCredentialByMembership,
  findLocalCredentialMembershipContext,
  findRecentCredentialManagementGrant,
  findRecentUserSession,
  hasUsableOidcLink,
  insertLocalCredentialAuditEvent,
  insertManagedLocalCredential,
  revokeGrantsFromLocalCredential,
  updateManagedLocalCredential,
} from '../../services/organization-local-credentials/index.js'

export type OrganizationLocalCredentialManagementError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_ORGANIZATION_FORBIDDEN' }
  | { type: 'AUTH_METHOD_NOT_ALLOWED' }
  | { type: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED' }
  | { type: 'AUTH_INVALID_CREDENTIALS' }
  | { type: 'LOCAL_CREDENTIAL_NOT_FOUND' }
  | { type: 'LOCAL_CREDENTIAL_LAST_AUTH_METHOD' }
  | { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' }

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: OrganizationLocalCredentialManagementError }

export interface LocalCredentialManagementMetadata {
  requestId?: string
  userAgent?: string
}

type CredentialMetadata =
  | {
      organization_id: string
      membership_id: string
      configured: false
    }
  | {
      organization_id: string
      membership_id: string
      configured: true
      login_email: string
      enabled: boolean
      password_changed_at: string
      updated_at: string
    }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
) => {
  const base = executor ?? db
  return 'transaction' in base ? base.transaction().execute(callback) : callback(base)
}

const userIdFromActor = (actor: RequestActor) => (actor.type === 'user' ? actor.user_id : undefined)

const toMetadata = (
  organizationId: string,
  membershipId: string,
  credential: Awaited<ReturnType<typeof findLocalCredentialByMembership>>
): CredentialMetadata =>
  credential
    ? {
        organization_id: organizationId,
        membership_id: membershipId,
        configured: true,
        login_email: credential.login_email,
        enabled: credential.enabled,
        password_changed_at: credential.password_changed_at.toISOString(),
        updated_at: credential.updated_at.toISOString(),
      }
    : { organization_id: organizationId, membership_id: membershipId, configured: false }

const authorizeSensitiveChange = async (
  currentPassword: string | undefined,
  credential: Awaited<ReturnType<typeof findLocalCredentialByMembership>>,
  context: NonNullable<Awaited<ReturnType<typeof findLocalCredentialMembershipContext>>>,
  sessionId: string,
  now: Date,
  executor: DbExecutor
): Promise<Result<true>> => {
  const recentAfter = new Date(now.getTime() - context.reauthentication_interval_seconds * 1000)
  if (!credential) {
    const recentSession = await findRecentUserSession(
      sessionId,
      context.user_id,
      recentAfter,
      now,
      executor
    )
    return recentSession
      ? { ok: true, value: true }
      : { ok: false, error: { type: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED' } }
  }

  if (currentPassword !== undefined) {
    if (!(await verifyPassword(credential.password_hash, currentPassword))) {
      return { ok: false, error: { type: 'AUTH_INVALID_CREDENTIALS' } }
    }
    return { ok: true, value: true }
  }

  const grant = await findRecentCredentialManagementGrant(
    sessionId,
    context.membership_id,
    context.user_id,
    context.policy_version,
    recentAfter,
    now,
    executor
  )
  return grant
    ? { ok: true, value: true }
    : { ok: false, error: { type: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED' } }
}

const isLocalLoginEmailConflict = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const databaseError = error as { code?: string; constraint?: string }
  return (
    databaseError.code === '23505' &&
    databaseError.constraint === 'organization_local_credentials_active_email_key'
  )
}

export const getMyOrganizationLocalCredential = async (
  actor: RequestActor,
  organizationId: string,
  executor: DbExecutor = db
): Promise<Result<CredentialMetadata>> => {
  const userId = userIdFromActor(actor)
  if (!userId) return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } }

  const context = await findLocalCredentialMembershipContext(organizationId, userId, executor)
  if (!context) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
  const credential = await findLocalCredentialByMembership(context.membership_id, executor)
  return {
    ok: true,
    value: toMetadata(context.organization_id, context.membership_id, credential),
  }
}

export const putMyOrganizationLocalCredential = async (
  actor: RequestActor,
  sessionId: string | undefined,
  organizationId: string,
  payload: PutOrganizationLocalCredentialRequest,
  metadata: LocalCredentialManagementMetadata = {},
  now = new Date(),
  executor?: DbExecutor
): Promise<Result<CredentialMetadata>> => {
  const userId = userIdFromActor(actor)
  if (!userId || !sessionId) return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } }

  const prechecked = await findLocalCredentialMembershipContext(
    organizationId,
    userId,
    executor ?? db
  )
  if (!prechecked) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
  if (!prechecked.local_auth_enabled) {
    return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } }
  }

  const passwordHash = await hashPassword(payload.new_password)
  const normalizedLoginEmail = normalizeLocalLoginEmail(payload.login_email)

  try {
    return await runInTransaction(executor, async (trx) => {
      const context = await findLocalCredentialMembershipContext(organizationId, userId, trx, true)
      if (!context) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
      if (!context.local_auth_enabled) {
        return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } }
      }

      const current = await findLocalCredentialByMembership(context.membership_id, trx, true)
      const authorized = await authorizeSensitiveChange(
        payload.current_password,
        current,
        context,
        sessionId,
        now,
        trx
      )
      if (!authorized.ok) return authorized

      if (
        await findEnabledLocalCredentialByNormalizedEmail(
          organizationId,
          normalizedLoginEmail,
          current?.id,
          trx
        )
      ) {
        return { ok: false, error: { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' } }
      }

      const credential = current
        ? await updateManagedLocalCredential(
            current.id,
            {
              login_email: payload.login_email.trim(),
              normalized_login_email: normalizedLoginEmail,
              password_hash: passwordHash,
              password_changed_at: now,
              failed_login_attempts: 0,
              locked_until: null,
              enabled: true,
            },
            trx
          )
        : await insertManagedLocalCredential(
            {
              membership_id: context.membership_id,
              organization_id: context.organization_id,
              login_email: payload.login_email.trim(),
              normalized_login_email: normalizedLoginEmail,
              password_hash: passwordHash,
              password_changed_at: now,
              failed_login_attempts: 0,
              locked_until: null,
              enabled: true,
            },
            trx
          )

      if (current) await revokeGrantsFromLocalCredential(current.id, now, trx)
      const changedFields = current
        ? [
            ...(current.login_email !== credential.login_email ? ['login_email'] : []),
            'password',
            ...(current.enabled ? [] : ['enabled']),
          ]
        : ['login_email', 'password', 'enabled']
      await insertLocalCredentialAuditEvent(
        {
          actor_user_id: userId,
          actor_membership_id: context.membership_id,
          organization_id: organizationId,
          target_type: 'organization_local_credential',
          target_id: credential.id,
          action: current ? 'update' : 'create',
          changed_fields: changedFields,
          before_values: current
            ? ({ login_email: current.login_email, enabled: current.enabled } as Json)
            : null,
          after_values: {
            login_email: credential.login_email,
            enabled: credential.enabled,
          } as Json,
          request_id: metadata.requestId ?? null,
        },
        trx
      )
      return {
        ok: true,
        value: toMetadata(context.organization_id, context.membership_id, credential),
      }
    })
  } catch (error) {
    if (isLocalLoginEmailConflict(error)) {
      return { ok: false, error: { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' } }
    }
    throw error
  }
}

export const disableMyOrganizationLocalCredential = async (
  actor: RequestActor,
  sessionId: string | undefined,
  organizationId: string,
  payload: DisableOrganizationLocalCredentialRequest,
  metadata: LocalCredentialManagementMetadata = {},
  now = new Date(),
  executor?: DbExecutor
): Promise<Result<CredentialMetadata>> => {
  const userId = userIdFromActor(actor)
  if (!userId || !sessionId) return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } }

  return runInTransaction(executor, async (trx) => {
    const context = await findLocalCredentialMembershipContext(organizationId, userId, trx, true)
    if (!context) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
    const current = await findLocalCredentialByMembership(context.membership_id, trx, true)
    if (!current) return { ok: false, error: { type: 'LOCAL_CREDENTIAL_NOT_FOUND' } }

    const authorized = await authorizeSensitiveChange(
      payload.current_password,
      current,
      context,
      sessionId,
      now,
      trx
    )
    if (!authorized.ok) return authorized
    if (!current.enabled) {
      return {
        ok: true,
        value: toMetadata(context.organization_id, context.membership_id, current),
      }
    }
    if (!(await hasUsableOidcLink(context.membership_id, organizationId, trx))) {
      return { ok: false, error: { type: 'LOCAL_CREDENTIAL_LAST_AUTH_METHOD' } }
    }

    const credential = await updateManagedLocalCredential(current.id, { enabled: false }, trx)
    await revokeGrantsFromLocalCredential(current.id, now, trx)
    await insertLocalCredentialAuditEvent(
      {
        actor_user_id: userId,
        actor_membership_id: context.membership_id,
        organization_id: organizationId,
        target_type: 'organization_local_credential',
        target_id: credential.id,
        action: 'disable',
        changed_fields: ['enabled'],
        before_values: { login_email: current.login_email, enabled: true } as Json,
        after_values: { login_email: credential.login_email, enabled: false } as Json,
        request_id: metadata.requestId ?? null,
      },
      trx
    )
    return {
      ok: true,
      value: toMetadata(context.organization_id, context.membership_id, credential),
    }
  })
}
