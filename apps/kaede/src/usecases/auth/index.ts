import { randomUUID } from 'node:crypto'
import type {
  ActivationCompleteRequest,
  ActivationVerifyRequest,
  ActivationVerifyResponse,
  AuthMeResponse,
  AuthUserResponse,
  ChangePasswordRequest,
  LoginRequest,
} from '../../schemas/auth.js'
import { activationCompleteRequestSchema } from '../../schemas/auth.js'
import type {
  ActivationTokenContext,
  GoogleIdTokenClaims,
  GoogleOidcClient,
} from '../../services/auth/index.js'
import {
  createSession,
  findActivationTokenContextByHash,
  findGoogleIdentityBySubject,
  findGoogleIdentityByUserId,
  findValidSessionByToken,
  hashActivationToken,
  insertAuthIdentity,
  markActivationTokenUsed,
  revokeAllSessionsByUserId,
  revokeSessionByToken,
} from '../../services/auth/index.js'
import { hashPassword, verifyPassword } from '../../services/auth/password.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  evaluateMembershipGrant,
  listMembershipGrantContexts,
  membershipAllowedAuthMethods,
} from '../../services/organization-authorization/index.js'
import type { MembershipGrantContext } from '../../services/organization-authorization/index.js'
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
  | { type: 'AUTH_ACTIVATION_TOKEN_INVALID' }

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

export type GetMeResult =
  | { ok: true; value: AuthMeResponse }
  | { ok: false; error: ActiveSessionUserError }

export interface LoginResultValue extends AuthUserResponse {
  sessionToken: string
}

export type ActivationCompleteResult =
  | {
      ok: true
      value: { ok: true }
    }
  | {
      ok: false
      error: { type: 'AUTH_ACTIVATION_TOKEN_INVALID' }
    }
export interface ActivationVerifyResult {
  ok: true
  value: ActivationVerifyResponse
}

export type OidcLoginError =
  | { type: 'OIDC_DISABLED' }
  | { type: 'OIDC_INVALID_STATE' }
  | { type: 'OIDC_PROVIDER_ERROR' }
  | { type: 'OIDC_EMAIL_UNVERIFIED' }
  | { type: 'OIDC_IDENTITY_CONFLICT' }
  | { type: 'AUTH_USER_DISABLED' }

export type OidcLinkError =
  | { type: 'OIDC_INVALID_STATE' }
  | { type: 'OIDC_PROVIDER_ERROR' }
  | { type: 'OIDC_EMAIL_UNVERIFIED' }
  | { type: 'OIDC_IDENTITY_CONFLICT' }
  | ActiveSessionUserError

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

export type OidcLinkResult =
  | {
      ok: true
      value: {
        ok: true
      }
    }
  | {
      ok: false
      error: OidcLinkError
    }

export interface CompleteGoogleOidcLoginParams {
  code: string | undefined
  state: string | undefined
  expectedState: string
  nonce: string
  codeVerifier: string
  allowUserCreation?: boolean
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
  sessionAuthMethod: 'password' | 'oidc',
  executor?: DbExecutor
): Promise<AuthUserResponse> => {
  const memberships = await listUserOrganizationMemberships(user.id, executor)

  return {
    session_auth_method: sessionAuthMethod,
    user: {
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      global_role: user.global_role as 'none' | 'admin',
      status: user.status as 'pending_activation' | 'active' | 'disabled',
      account_state: deriveAccountState({
        globalRole: user.global_role as 'none' | 'admin',
        status: user.status as 'pending_activation' | 'active' | 'disabled',
        membershipCount: memberships.length,
      }),
      password_changed_at: toIsoOrNull(user.password_changed_at),
      memberships: memberships.map((membership) => ({
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        role: membership.role as 'member' | 'manager' | 'owner',
      })),
    },
  }
}

const grantTimeline = (context: MembershipGrantContext) => {
  const authenticatedAt = context.grant_authenticated_at
  const expiresAt = context.grant_expires_at
  const intervalSeconds = context.reauthentication_interval_seconds
  if (!authenticatedAt || !expiresAt || intervalSeconds === null) {
    return {
      authenticated_at: null,
      reauthentication_required_at: null,
      expires_at: expiresAt?.toISOString() ?? null,
      effective_expires_at: null,
    }
  }

  const reauthenticationRequiredAt = new Date(authenticatedAt.getTime() + intervalSeconds * 1000)
  const effectiveExpiresAt =
    reauthenticationRequiredAt <= expiresAt ? reauthenticationRequiredAt : expiresAt
  return {
    authenticated_at: authenticatedAt.toISOString(),
    reauthentication_required_at: reauthenticationRequiredAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    effective_expires_at: effectiveExpiresAt.toISOString(),
  }
}

const membershipGrantState = (
  context: MembershipGrantContext,
  now: Date
): AuthMeResponse['user']['memberships'][number]['grant_state'] => {
  if (context.membership_status === 'suspended') {
    return {
      status: 'forbidden',
      reason: 'membership_suspended',
      auth_method: null,
      authenticated_at: null,
      reauthentication_required_at: null,
      expires_at: null,
      effective_expires_at: null,
    }
  }
  if (context.organization_status !== 'active') {
    return {
      status: 'forbidden',
      reason: 'organization_unavailable',
      auth_method: null,
      authenticated_at: null,
      reauthentication_required_at: null,
      expires_at: null,
      effective_expires_at: null,
    }
  }
  if (!context.auth_settings_available) {
    return {
      status: 'forbidden',
      reason: 'auth_settings_unavailable',
      auth_method: null,
      authenticated_at: null,
      reauthentication_required_at: null,
      expires_at: null,
      effective_expires_at: null,
    }
  }

  const authorization = evaluateMembershipGrant(context, 'member', now)
  if (authorization.ok) {
    return {
      status: 'granted',
      reason: null,
      auth_method: authorization.authMethod,
      authenticated_at: authorization.authenticatedAt.toISOString(),
      reauthentication_required_at: authorization.reauthenticationRequiredAt.toISOString(),
      expires_at: authorization.expiresAt.toISOString(),
      effective_expires_at: authorization.effectiveExpiresAt.toISOString(),
    }
  }

  if (authorization.type === 'reauthentication_required') {
    const timeline = grantTimeline(context)
    return {
      status: 'reauthentication_required',
      reason: authorization.reason,
      auth_method:
        context.grant_auth_method === 'local' || context.grant_auth_method === 'oidc'
          ? context.grant_auth_method
          : null,
      ...timeline,
    }
  }

  return {
    status: 'forbidden',
    reason: 'organization_unavailable',
    auth_method: null,
    authenticated_at: null,
    reauthentication_required_at: null,
    expires_at: null,
    effective_expires_at: null,
  }
}

const buildAuthMeResponse = async (
  user: User,
  sessionAuthMethod: 'password' | 'oidc',
  sessionId: string,
  now: Date,
  executor?: DbExecutor
): Promise<AuthMeResponse> => {
  const memberships = await listMembershipGrantContexts(sessionId, user.id, executor)

  return {
    session_auth_method: sessionAuthMethod,
    user: {
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      global_role: user.global_role as 'none' | 'admin',
      status: user.status as 'pending_activation' | 'active' | 'disabled',
      account_state: deriveAccountState({
        globalRole: user.global_role as 'none' | 'admin',
        status: user.status as 'pending_activation' | 'active' | 'disabled',
        membershipCount: memberships.length,
      }),
      password_changed_at: toIsoOrNull(user.password_changed_at),
      memberships: memberships.map((membership) => ({
        membership_id: membership.membership_id,
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        organization_slug: membership.organization_slug,
        role: membership.membership_role as 'member' | 'manager' | 'owner',
        status: membership.membership_status as 'active' | 'suspended',
        allowed_auth_methods:
          membership.membership_status === 'active' &&
          membership.organization_status === 'active' &&
          membership.auth_settings_available
            ? membershipAllowedAuthMethods(membership)
            : [],
        grant_state: membershipGrantState(membership, now),
      })),
    },
  }
}

const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000
const activationCompleteIdempotencyWindowMs = 3 * 1000

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

const isValidPendingActivationContext = (context: ActivationTokenContext, now: Date) => {
  return (
    context.used_at === null &&
    context.revoked_at === null &&
    context.expires_at > now &&
    context.user_status === 'pending_activation' &&
    context.user_password_hash === null
  )
}

const isRecentCompletedActivationContext = (context: ActivationTokenContext, now: Date) => {
  return (
    context.used_at !== null &&
    context.user_status === 'active' &&
    now.getTime() - context.used_at.getTime() <= activationCompleteIdempotencyWindowMs
  )
}

const findActivationContextByToken = async (
  token: string,
  executor: DbExecutor
): Promise<ActivationTokenContext | undefined> => {
  if (token.trim().length === 0) {
    return undefined
  }

  return findActivationTokenContextByHash(hashActivationToken(token), executor)
}

const attachGoogleIdentityToUser = async (
  user: User,
  claims: GoogleIdTokenClaims,
  executor: DbExecutor
): Promise<User> => {
  await insertAuthIdentity(
    {
      user_id: user.id,
      provider: 'google',
      provider_subject: claims.sub,
      email: claims.email,
      email_verified: claims.emailVerified,
      hosted_domain: claims.hostedDomain,
    },
    executor
  )

  return user
}

const findOrCreateGoogleOidcUser = async (
  claims: GoogleIdTokenClaims,
  options: { allowUserCreation: boolean },
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
    if (existingUser.status !== 'active') {
      return {
        ok: false,
        error: { type: 'AUTH_INVALID_CREDENTIALS' },
      }
    }

    const existingUserIdentity = await findGoogleIdentityByUserId(existingUser.id, executor)

    if (existingUserIdentity) {
      return {
        ok: false,
        error: { type: 'AUTH_INVALID_CREDENTIALS' },
      }
    }

    const linkedUser = await attachGoogleIdentityToUser(existingUser, claims, executor)

    return {
      ok: true,
      value: linkedUser,
    }
  }

  if (!options.allowUserCreation) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  const createdUser = await insertUser(
    {
      email: claims.email,
      display_name: claims.name,
      password_hash: await createOidcPasswordHash(),
      global_role: 'none',
      password_changed_at: null,
      status: 'active',
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

const verifyGoogleOidcClaims = async (
  params: CompleteGoogleOidcLoginParams,
  client: GoogleOidcClient
): Promise<
  | {
      ok: true
      value: GoogleIdTokenClaims
    }
  | {
      ok: false
      error: Extract<
        OidcLoginError,
        { type: 'OIDC_INVALID_STATE' | 'OIDC_PROVIDER_ERROR' | 'OIDC_EMAIL_UNVERIFIED' }
      >
    }
> => {
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

  return {
    ok: true,
    value: claims,
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

  if (user.status !== 'active') {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  if (!user.password_hash) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
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

  await updateUser(
    user.id,
    {
      failed_login_attempts: 0,
      locked_until: null,
    },
    executor
  )

  const { token } = await createSession({ authMethod: 'password', userId: user.id, now }, executor)
  const response = await buildAuthUserResponse(user, 'password', executor)

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
  const claimsResult = await verifyGoogleOidcClaims(params, client)

  if (!claimsResult.ok) {
    return claimsResult
  }

  const userResult = await runInTransaction(executor, async (trx) => {
    return findOrCreateGoogleOidcUser(
      claimsResult.value,
      { allowUserCreation: params.allowUserCreation ?? true },
      trx
    )
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

  if (userResult.value.status !== 'active') {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  const { token } = await createSession(
    { authMethod: 'oidc', userId: userResult.value.id, now },
    executor
  )

  return {
    ok: true,
    value: {
      sessionToken: token,
    },
  }
}

export const completeGoogleOidcLink = async (
  sessionToken: string | undefined,
  params: CompleteGoogleOidcLoginParams,
  client: GoogleOidcClient,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<OidcLinkResult> => {
  const activeUser = await requireActiveSessionUser(sessionToken, executor, now)

  if (!activeUser.ok) {
    return activeUser
  }

  const claimsResult = await verifyGoogleOidcClaims(params, client)

  if (!claimsResult.ok) {
    return claimsResult
  }

  const result = await runInTransaction(executor, async (trx) => {
    const identityBySubject = await findGoogleIdentityBySubject(claimsResult.value.sub, trx)

    if (identityBySubject) {
      return identityBySubject.user_id === activeUser.value.id
        ? ({ ok: true, value: { ok: true } } as const)
        : ({ ok: false, error: { type: 'OIDC_IDENTITY_CONFLICT' } } as const)
    }

    const identityByUserId = await findGoogleIdentityByUserId(activeUser.value.id, trx)

    if (identityByUserId) {
      return {
        ok: false,
        error: { type: 'OIDC_IDENTITY_CONFLICT' },
      } as const
    }

    await attachGoogleIdentityToUser(activeUser.value, claimsResult.value, trx)

    return {
      ok: true,
      value: { ok: true },
    } as const
  })

  return result
}

export const getMe = async (
  sessionToken: string | undefined,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<GetMeResult> => {
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

  if (user.status !== 'active') {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  return {
    ok: true,
    value: await buildAuthMeResponse(
      user,
      sessionResult.session.auth_method as 'password' | 'oidc',
      sessionResult.session.id,
      now,
      executor
    ),
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

  if (user.status !== 'active') {
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

export const verifyActivationToken = async (
  payload: ActivationVerifyRequest,
  now: Date = new Date(),
  executor: DbExecutor = db
): Promise<ActivationVerifyResult> => {
  const context = await findActivationContextByToken(payload.token, executor)

  if (!context || !isValidPendingActivationContext(context, now)) {
    return {
      ok: true,
      value: {
        valid: false,
      },
    }
  }

  return {
    ok: true,
    value: {
      valid: true,
      email: context.user_email,
      display_name: context.user_display_name,
      organization_name: context.organization_name,
      expires_at: context.expires_at.toISOString(),
    },
  }
}

export const completeActivation = async (
  payload: ActivationCompleteRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<ActivationCompleteResult> => {
  if (!activationCompleteRequestSchema.safeParse(payload).success) {
    return {
      ok: false,
      error: { type: 'AUTH_ACTIVATION_TOKEN_INVALID' },
    }
  }

  return runInTransaction(executor, async (trx) => {
    const context = await findActivationContextByToken(payload.token, trx)

    if (!context) {
      return {
        ok: false,
        error: { type: 'AUTH_ACTIVATION_TOKEN_INVALID' },
      }
    }

    if (isRecentCompletedActivationContext(context, now)) {
      return {
        ok: true,
        value: { ok: true },
      }
    }

    if (!isValidPendingActivationContext(context, now)) {
      return {
        ok: false,
        error: { type: 'AUTH_ACTIVATION_TOKEN_INVALID' },
      }
    }

    const usedToken = await markActivationTokenUsed(context.token_id, now, trx)

    if (!usedToken) {
      const latestContext = await findActivationContextByToken(payload.token, trx)

      if (latestContext && isRecentCompletedActivationContext(latestContext, now)) {
        return {
          ok: true,
          value: { ok: true },
        }
      }

      return {
        ok: false,
        error: { type: 'AUTH_ACTIVATION_TOKEN_INVALID' },
      }
    }

    await updateUser(
      context.user_id,
      {
        password_hash: await hashPassword(payload.password),
        password_changed_at: now,
        status: 'active',
        failed_login_attempts: 0,
        locked_until: null,
      },
      trx
    )

    return {
      ok: true,
      value: { ok: true },
    }
  })
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

  if (user.status !== 'active') {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  if (!user.password_hash) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  const currentPasswordMatches = await verifyPassword(user.password_hash, payload.current_password)

  if (!currentPasswordMatches) {
    return {
      ok: false,
      error: { type: 'AUTH_INVALID_CREDENTIALS' },
    }
  }

  const passwordHash = await hashPassword(payload.new_password)

  await updateUser(
    user.id,
    {
      password_hash: passwordHash,
      password_changed_at: now,
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
    case 'AUTH_ACTIVATION_TOKEN_INVALID':
    case 'AUTH_INVALID_CREDENTIALS':
    case 'AUTH_SESSION_EXPIRED':
    case 'AUTH_SESSION_REVOKED':
    case 'AUTH_UNAUTHENTICATED':
      return 401
    case 'AUTH_USER_DISABLED':
    case 'AUTH_USER_LOCKED':
      return 403
  }
}
