import { randomUUID } from 'node:crypto'
import type { AuthUserResponse, ChangePasswordRequest, LoginRequest } from '../../schemas/auth.js'
import {
  createSession,
  findGoogleIdentityBySubject,
  findGoogleIdentityByUserId,
  findValidSessionByToken,
  insertAuthIdentity,
  revokeAllSessionsByUserId,
  revokeSessionByToken,
} from '../../services/auth/index.js'
import type { GoogleIdTokenClaims, GoogleOidcClient } from '../../services/auth/index.js'
import { hashPassword, verifyPassword } from '../../services/auth/password.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  findUserByEmail,
  findUserById,
  insertUser,
  listUserOrganizationMemberships,
  updateUser,
} from '../../services/users/index.js'
import type { User } from '../../services/users/index.js'
import { deriveAccountState } from '../authorization.js'

type AuthError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_INVALID_CREDENTIALS' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'AUTH_USER_LOCKED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_TEMPORARY_PASSWORD_EXPIRED' }

type AuthResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: AuthError
    }

export type ActiveSessionUserError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_USER_DISABLED' }

export type ActiveSessionUserResult =
  | {
      ok: true
      value: User
    }
  | {
      ok: false
      error: ActiveSessionUserError
    }

export interface LoginResultValue extends AuthUserResponse {
  sessionToken: string
}

export type OidcLoginError =
  | { type: 'OIDC_DISABLED' }
  | { type: 'OIDC_INVALID_STATE' }
  | { type: 'OIDC_PROVIDER_ERROR' }
  | { type: 'OIDC_EMAIL_UNVERIFIED' }
  | { type: 'OIDC_IDENTITY_CONFLICT' }
  | { type: 'AUTH_USER_DISABLED' }

export type OidcLoginResult =
  | {
      ok: true
      value: {
        sessionToken: string
      }
    }
  | {
      ok: false
      error: OidcLoginError
    }

export interface CompleteGoogleOidcLoginParams {
  code: string | undefined
  state: string | undefined
  expectedState: string
  nonce: string
  codeVerifier: string
}

const toIsoOrNull = (value: Date | null): string | null => value?.toISOString() ?? null

const mapSessionError = (
  error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
): AuthError => {
  switch (error) {
    case 'SESSION_NOT_FOUND':
      return { type: 'AUTH_UNAUTHENTICATED' }
    case 'SESSION_EXPIRED':
      return { type: 'AUTH_SESSION_EXPIRED' }
    case 'SESSION_REVOKED':
      return { type: 'AUTH_SESSION_REVOKED' }
  }
}

const mapActiveSessionError = (
  error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
): ActiveSessionUserError => {
  switch (error) {
    case 'SESSION_NOT_FOUND':
      return { type: 'AUTH_UNAUTHENTICATED' }
    case 'SESSION_EXPIRED':
      return { type: 'AUTH_SESSION_EXPIRED' }
    case 'SESSION_REVOKED':
      return { type: 'AUTH_SESSION_REVOKED' }
  }
}

const buildAuthUserResponse = async (
  user: User,
  executor?: DbExecutor
): Promise<AuthUserResponse> => {
  const memberships = await listUserOrganizationMemberships(user.id, executor)

  return {
    user: {
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      global_role: user.global_role as 'none' | 'admin',
      account_state: deriveAccountState({
        globalRole: user.global_role as 'none' | 'admin',
        isActive: user.is_active,
        membershipCount: memberships.length,
      }),
      password_must_change: user.password_must_change,
      password_changed_at: toIsoOrNull(user.password_changed_at),
      temporary_password_expires_at: toIsoOrNull(user.temporary_password_expires_at),
      memberships: memberships.map((membership) => ({
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        role: membership.role as 'member' | 'manager' | 'owner',
      })),
    },
  }
}

const assertTemporaryPasswordNotExpired = (user: User, now: Date): AuthError | undefined => {
  if (
    user.password_must_change &&
    user.temporary_password_expires_at &&
    user.temporary_password_expires_at < now
  ) {
    return { type: 'AUTH_TEMPORARY_PASSWORD_EXPIRED' }
  }

  return undefined
}

const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000

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

const createOidcPasswordHash = async () => {
  return hashPassword(`oidc:${randomUUID()}:${randomUUID()}`)
}

const findOrCreateGoogleOidcUser = async (
  claims: GoogleIdTokenClaims,
  executor: DbExecutor
): Promise<AuthResult<User>> => {
  const identity = await findGoogleIdentityBySubject(claims.sub, executor)

  if (identity) {
    const user = await findUserById(identity.user_id, executor)

    if (!user) {
      return {
        ok: false,
        error: { type: 'AUTH_UNAUTHENTICATED' },
      }
    }

    return {
      ok: true,
      value: user,
    }
  }

  const existingUser = await findUserByEmail(claims.email, executor)

  if (existingUser) {
    if (!existingUser.is_active) {
      return {
        ok: true,
        value: existingUser,
      }
    }

    if (existingUser.global_role === 'admin') {
      return {
        ok: false,
        error: { type: 'AUTH_INVALID_CREDENTIALS' },
      }
    }

    const existingIdentity = await findGoogleIdentityByUserId(existingUser.id, executor)

    if (existingIdentity) {
      return {
        ok: false,
        error: { type: 'AUTH_INVALID_CREDENTIALS' },
      }
    }

    await insertAuthIdentity(
      {
        user_id: existingUser.id,
        provider: 'google',
        provider_subject: claims.sub,
        email: claims.email,
        email_verified: claims.emailVerified,
        hosted_domain: claims.hostedDomain,
      },
      executor
    )

    return {
      ok: true,
      value: existingUser,
    }
  }

  const createdUser = await insertUser(
    {
      email: claims.email,
      display_name: claims.name,
      password_hash: await createOidcPasswordHash(),
      global_role: 'none',
      is_active: true,
      password_must_change: false,
      password_changed_at: null,
      temporary_password_expires_at: null,
    },
    executor
  )

  await insertAuthIdentity(
    {
      user_id: createdUser.id,
      provider: 'google',
      provider_subject: claims.sub,
      email: claims.email,
      email_verified: claims.emailVerified,
      hosted_domain: claims.hostedDomain,
    },
    executor
  )

  return {
    ok: true,
    value: createdUser,
  }
}

export const login = async (
  payload: LoginRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<AuthResult<LoginResultValue>> => {
  const user = await findUserByEmail(payload.email, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  if (!user.is_active) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  if (user.locked_until && user.locked_until > now) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_LOCKED' },
    }
  }

  const passwordMatches = await verifyPassword(user.password_hash, payload.password)

  if (!passwordMatches) {
    const failedAttempts = user.failed_login_attempts + 1
    const lockedUntil =
      failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
        : null

    await updateUser(
      user.id,
      {
        failed_login_attempts: failedAttempts,
        locked_until: lockedUntil,
      },
      executor
    )

    if (lockedUntil) {
      return {
        ok: false,
        error: { type: 'AUTH_USER_LOCKED' },
      }
    }

    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  const temporaryPasswordError = assertTemporaryPasswordNotExpired(user, now)

  if (temporaryPasswordError) {
    return {
      ok: false,
      error: temporaryPasswordError,
    }
  }

  await updateUser(
    user.id,
    {
      failed_login_attempts: 0,
      locked_until: null,
    },
    executor
  )

  const { token } = await createSession({ userId: user.id, now }, executor)
  const response = await buildAuthUserResponse(user, executor)

  return {
    ok: true,
    value: {
      ...response,
      sessionToken: token,
    },
  }
}

export const completeGoogleOidcLogin = async (
  params: CompleteGoogleOidcLoginParams,
  client: GoogleOidcClient,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<OidcLoginResult> => {
  if (!params.code || !params.state || params.state !== params.expectedState) {
    return {
      ok: false,
      error: { type: 'OIDC_INVALID_STATE' },
    }
  }

  let claims: GoogleIdTokenClaims

  try {
    const idToken = await client.exchangeCodeForIdToken({
      code: params.code,
      codeVerifier: params.codeVerifier,
    })
    claims = await client.verifyIdToken({
      idToken,
      nonce: params.nonce,
    })
  } catch {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_ERROR' },
    }
  }

  if (!claims.emailVerified) {
    return {
      ok: false,
      error: { type: 'OIDC_EMAIL_UNVERIFIED' },
    }
  }

  const userResult = await runInTransaction(executor, async (trx) => {
    return findOrCreateGoogleOidcUser(claims, trx)
  })

  if (!userResult.ok) {
    return {
      ok: false,
      error:
        userResult.error.type === 'AUTH_INVALID_CREDENTIALS'
          ? { type: 'OIDC_IDENTITY_CONFLICT' }
          : { type: 'OIDC_PROVIDER_ERROR' },
    }
  }

  if (!userResult.value.is_active) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  const { token } = await createSession({ userId: userResult.value.id, now }, executor)

  return {
    ok: true,
    value: {
      sessionToken: token,
    },
  }
}

export const getMe = async (
  sessionToken: string | undefined,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<AuthResult<AuthUserResponse>> => {
  if (!sessionToken) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  const sessionResult = await findValidSessionByToken(sessionToken, now, executor)

  if (!sessionResult.ok) {
    return {
      ok: false,
      error: mapActiveSessionError(sessionResult.error),
    }
  }

  const user = await findUserById(sessionResult.session.user_id, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  if (!user.is_active) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  return {
    ok: true,
    value: await buildAuthUserResponse(user, executor),
  }
}

export const requireActiveSessionUser = async (
  sessionToken: string | undefined,
  executor?: DbExecutor,
  now: Date = new Date()
): Promise<ActiveSessionUserResult> => {
  if (!sessionToken) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  const sessionResult = await findValidSessionByToken(sessionToken, now, executor)

  if (!sessionResult.ok) {
    return {
      ok: false,
      error: mapActiveSessionError(sessionResult.error),
    }
  }

  const user = await findUserById(sessionResult.session.user_id, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  if (!user.is_active) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  return {
    ok: true,
    value: user,
  }
}

export const logout = async (
  sessionToken: string | undefined,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<{ ok: true }> => {
  if (sessionToken) {
    await revokeSessionByToken(sessionToken, now, executor)
  }

  return { ok: true }
}

export const changePassword = async (
  sessionToken: string | undefined,
  payload: ChangePasswordRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<AuthResult<{ ok: true }>> => {
  if (!sessionToken) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  const sessionResult = await findValidSessionByToken(sessionToken, now, executor)

  if (!sessionResult.ok) {
    return {
      ok: false,
      error: mapSessionError(sessionResult.error),
    }
  }

  const user = await findUserById(sessionResult.session.user_id, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  if (!user.is_active) {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  const currentPasswordMatches = await verifyPassword(user.password_hash, payload.current_password)

  if (!currentPasswordMatches) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  const temporaryPasswordError = assertTemporaryPasswordNotExpired(user, now)

  if (temporaryPasswordError) {
    return {
      ok: false,
      error: temporaryPasswordError,
    }
  }

  const passwordHash = await hashPassword(payload.new_password)

  await updateUser(
    user.id,
    {
      password_hash: passwordHash,
      password_must_change: false,
      password_changed_at: now,
      temporary_password_expires_at: null,
    },
    executor
  )

  await revokeAllSessionsByUserId(user.id, now, executor)

  return {
    ok: true,
    value: { ok: true },
  }
}

export const authErrorStatus = (error: AuthError): 401 | 403 => {
  switch (error.type) {
    case 'AUTH_INVALID_CREDENTIALS':
    case 'AUTH_SESSION_EXPIRED':
    case 'AUTH_SESSION_REVOKED':
    case 'AUTH_UNAUTHENTICATED':
      return 401
    case 'AUTH_TEMPORARY_PASSWORD_EXPIRED':
    case 'AUTH_USER_DISABLED':
    case 'AUTH_USER_LOCKED':
      return 403
  }
}
