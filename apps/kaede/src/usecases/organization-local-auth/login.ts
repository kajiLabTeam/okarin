import type { LocalOrganizationLoginRequest } from '../../schemas/organization-local-auth.js'
import { createSession, findValidSessionByToken } from '../../services/auth/index.js'
import { verifyPassword } from '../../services/auth/password.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  findLocalCredentialContextForUpdate,
  findOrganizationLocalAuthPolicyBySlug,
  insertAuthenticationEvent,
  normalizeLocalLoginEmail,
  updateLocalCredentialAttempts,
  upsertLocalMembershipGrant,
} from '../../services/organization-local-auth/index.js'

const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$x+P5/ReUqXmnmvL6nvl/sw$U6rmJ/nwCpXHwg93wQKEQxKBgVGC6n+ZSV1KumkR8i8'

export type LocalOrganizationLoginError =
  | { type: 'AUTH_INVALID_CREDENTIALS' }
  | { type: 'AUTH_METHOD_NOT_ALLOWED' }
  | { type: 'AUTH_CREDENTIAL_LOCKED' }
  | { type: 'AUTH_IDENTITY_USER_MISMATCH' }
  | { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_ALREADY_EXISTS' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }

export type LocalOrganizationLoginResult =
  | {
      ok: true
      value: {
        sessionToken?: string
        session: { id: string; expires_at: string }
        membership: {
          id: string
          organization_id: string
          role: 'member' | 'manager' | 'owner'
          status: 'active'
        }
        grant: {
          auth_method: 'local'
          authenticated_at: string
          expires_at: string
        }
        return_to: string
      }
    }
  | { ok: false; error: LocalOrganizationLoginError }

export interface LocalOrganizationLoginMetadata {
  requestId?: string
  userAgent?: string
}

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const baseExecutor = executor ?? db

  if ('transaction' in baseExecutor) {
    return baseExecutor.transaction().execute((trx) => callback(trx))
  }

  return callback(baseExecutor)
}

const sessionError = (
  error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
): LocalOrganizationLoginError => {
  switch (error) {
    case 'SESSION_EXPIRED':
      return { type: 'AUTH_SESSION_EXPIRED' }
    case 'SESSION_REVOKED':
      return { type: 'AUTH_SESSION_REVOKED' }
    case 'SESSION_NOT_FOUND':
      return { type: 'AUTH_UNAUTHENTICATED' }
  }
}

export const loginToOrganizationWithLocalCredential = async (
  organizationSlug: string,
  sessionToken: string | undefined,
  payload: LocalOrganizationLoginRequest,
  metadata: LocalOrganizationLoginMetadata = {},
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<LocalOrganizationLoginResult> => {
  return runInTransaction(executor, async (trx) => {
    const intent = payload.intent ?? (sessionToken ? 'reauthenticate' : 'login')
    const policy = await findOrganizationLocalAuthPolicyBySlug(organizationSlug, trx)

    if (!policy?.local_auth_enabled || policy.organization_status !== 'active') {
      return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } } as const
    }

    let existingSession: Awaited<ReturnType<typeof findValidSessionByToken>> | undefined
    if (sessionToken) {
      existingSession = await findValidSessionByToken(sessionToken, now, trx)
      if (intent === 'reauthenticate' && !existingSession.ok) {
        return { ok: false, error: sessionError(existingSession.error) } as const
      }
      if (intent === 'login' && existingSession.ok) {
        return { ok: false, error: { type: 'AUTH_SESSION_ALREADY_EXISTS' } } as const
      }
    } else if (intent === 'reauthenticate') {
      return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } } as const
    }

    const normalizedLoginEmail = normalizeLocalLoginEmail(payload.login_email)
    const credential = await findLocalCredentialContextForUpdate(
      policy.organization_id,
      normalizedLoginEmail,
      trx
    )

    if (!credential) {
      await verifyPassword(DUMMY_PASSWORD_HASH, payload.password)
      await insertAuthenticationEvent(
        {
          event_type: 'local_login',
          outcome: 'failure',
          failure_code: 'AUTH_INVALID_CREDENTIALS',
          organization_id: policy.organization_id,
          auth_method: 'local',
          request_id: metadata.requestId ?? null,
          user_agent: metadata.userAgent ?? null,
        },
        trx
      )
      return { ok: false, error: { type: 'AUTH_INVALID_CREDENTIALS' } } as const
    }

    const eventType = intent === 'reauthenticate' ? 'local_reauthenticate' : 'local_login'
    const eventContext = {
      event_type: eventType,
      user_id: credential.user_id,
      organization_id: credential.organization_id,
      membership_id: credential.membership_id,
      auth_method: 'local' as const,
      credential_reference_id: credential.credential_id,
      request_id: metadata.requestId ?? null,
      user_agent: metadata.userAgent ?? null,
    }

    if (credential.locked_until && credential.locked_until > now) {
      await insertAuthenticationEvent(
        {
          ...eventContext,
          outcome: 'failure',
          failure_code: 'AUTH_CREDENTIAL_LOCKED',
        },
        trx
      )
      return { ok: false, error: { type: 'AUTH_CREDENTIAL_LOCKED' } } as const
    }

    const passwordMatches = await verifyPassword(credential.password_hash, payload.password)

    if (!passwordMatches) {
      const failedAttempts = credential.failed_login_attempts + 1
      const lockedUntil =
        failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
          ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
          : null

      await updateLocalCredentialAttempts(
        credential.credential_id,
        { failed_login_attempts: failedAttempts, locked_until: lockedUntil },
        trx
      )
      await insertAuthenticationEvent(
        {
          ...eventContext,
          outcome: 'failure',
          failure_code: lockedUntil ? 'AUTH_CREDENTIAL_LOCKED' : 'AUTH_INVALID_CREDENTIALS',
        },
        trx
      )
      return lockedUntil
        ? ({ ok: false, error: { type: 'AUTH_CREDENTIAL_LOCKED' } } as const)
        : ({ ok: false, error: { type: 'AUTH_INVALID_CREDENTIALS' } } as const)
    }

    if (credential.user_status !== 'active') {
      return { ok: false, error: { type: 'AUTH_USER_DISABLED' } } as const
    }

    if (credential.membership_status !== 'active' || !credential.membership_id) {
      return { ok: false, error: { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' } } as const
    }

    let activeSession
    let createdSessionToken: string | undefined

    if (intent === 'reauthenticate') {
      if (!existingSession?.ok) {
        return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } } as const
      }
      if (existingSession.session.user_id !== credential.user_id) {
        await insertAuthenticationEvent(
          {
            ...eventContext,
            session_id: existingSession.session.id,
            outcome: 'failure',
            failure_code: 'AUTH_IDENTITY_USER_MISMATCH',
          },
          trx
        )
        return { ok: false, error: { type: 'AUTH_IDENTITY_USER_MISMATCH' } } as const
      }
      activeSession = existingSession.session
    } else {
      const created = await createSession(
        { authMethod: 'password', userId: credential.user_id, now },
        trx
      )
      activeSession = created.session
      createdSessionToken = created.token
    }

    const authenticatedAt = now
    const grantExpiresAt = new Date(
      authenticatedAt.getTime() + policy.membership_grant_ttl_seconds * 1000
    )
    const grant = await upsertLocalMembershipGrant(
      {
        session_id: activeSession.id,
        membership_id: credential.membership_id,
        user_id: credential.user_id,
        auth_method: 'local',
        policy_version: policy.policy_version,
        local_credential_id: credential.credential_id,
        member_oidc_identity_id: null,
        authenticated_at: authenticatedAt,
        expires_at: grantExpiresAt,
        revoked_at: null,
      },
      trx
    )

    await updateLocalCredentialAttempts(
      credential.credential_id,
      { failed_login_attempts: 0, locked_until: null },
      trx
    )
    await insertAuthenticationEvent(
      {
        ...eventContext,
        session_id: activeSession.id,
        outcome: 'success',
      },
      trx
    )

    return {
      ok: true,
      value: {
        sessionToken: createdSessionToken,
        session: {
          id: activeSession.id,
          expires_at: activeSession.expires_at.toISOString(),
        },
        membership: {
          id: credential.membership_id,
          organization_id: credential.organization_id,
          role: credential.membership_role as 'member' | 'manager' | 'owner',
          status: 'active',
        },
        grant: {
          auth_method: 'local',
          authenticated_at: grant.authenticated_at.toISOString(),
          expires_at: grant.expires_at.toISOString(),
        },
        return_to: payload.return_to ?? '/',
      },
    }
  })
}
