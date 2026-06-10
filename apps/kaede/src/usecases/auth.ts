import type { Kysely, Selectable, Transaction } from 'kysely'
import type { AuthUserResponse, ChangePasswordRequest, LoginRequest } from '../schemas/auth.js'
import {
  createSession,
  findValidSessionByToken,
  revokeAllSessionsByUserId,
  revokeSessionByToken,
} from '../services/auth/index.js'
import { hashPassword, verifyPassword } from '../services/auth/password.js'
import type { Users } from '../services/db/generated.js'
import { db } from '../services/db/index.js'
import type { DB } from '../services/db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>

type AuthError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_INVALID_CREDENTIALS' }
  | { type: 'AUTH_USER_DISABLED' }
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

const findUserByEmail = async (
  email: string,
  executor: DbExecutor = db
): Promise<Selectable<Users> | undefined> => {
  return executor.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst()
}

const findUserById = async (
  userId: string,
  executor: DbExecutor = db
): Promise<Selectable<Users> | undefined> => {
  return executor.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst()
}

const buildAuthUserResponse = async (
  user: Selectable<Users>,
  executor: DbExecutor = db
): Promise<AuthUserResponse> => {
  const memberships = await executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('organizations as organization', 'organization.id', 'membership.organization_id')
    .select([
      'membership.organization_id as organization_id',
      'organization.name as organization_name',
      'membership.role as role',
    ])
    .where('membership.user_id', '=', user.id)
    .orderBy('organization.name', 'asc')
    .execute()

  return {
    user: {
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      global_role: user.global_role as 'none' | 'admin',
      password_must_change: user.password_must_change,
      password_changed_at: toIsoOrNull(user.password_changed_at),
      temporary_password_expires_at: toIsoOrNull(user.temporary_password_expires_at),
      memberships: memberships.map((membership) => ({
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        role: membership.role as 'member' | 'manager',
      })),
    },
  }
}

const assertTemporaryPasswordNotExpired = (
  user: Selectable<Users>,
  now: Date
): AuthError | undefined => {
  if (
    user.password_must_change &&
    user.temporary_password_expires_at &&
    user.temporary_password_expires_at < now
  ) {
    return { type: 'AUTH_TEMPORARY_PASSWORD_EXPIRED' }
  }

  return undefined
}

export const login = async (
  payload: LoginRequest,
  now: Date = new Date(),
  executor: DbExecutor = db
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

  const passwordMatches = await verifyPassword(user.password_hash, payload.password)

  if (!passwordMatches) {
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
  executor: DbExecutor = db
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

  return {
    ok: true,
    value: await buildAuthUserResponse(user, executor),
  }
}

export const logout = async (
  sessionToken: string | undefined,
  now: Date = new Date(),
  executor: DbExecutor = db
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
  executor: DbExecutor = db
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

  await executor
    .updateTable('users')
    .set({
      password_hash: passwordHash,
      password_must_change: false,
      password_changed_at: now,
      temporary_password_expires_at: null,
    })
    .where('id', '=', user.id)
    .execute()

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
      return 403
  }
}
