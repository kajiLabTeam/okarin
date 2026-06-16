import type { AuthUserResponse, ChangePasswordRequest, LoginRequest } from '../../schemas/auth.js'
import {
  createSession,
  findValidSessionByToken,
  revokeAllSessionsByUserId,
  revokeSessionByToken,
} from '../../services/auth/index.js'
import { hashPassword, verifyPassword } from '../../services/auth/password.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  findUserByEmail,
  findUserById,
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
