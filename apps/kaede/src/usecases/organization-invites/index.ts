import { randomUUID } from 'node:crypto'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  AcceptLocalOrganizationInviteRequest,
  CreateOrganizationInviteRequest,
  InviteRole,
} from '../../schemas/organization-invites.js'
import {
  createSession,
  findValidSessionByToken,
  generateActivationToken,
  hashActivationToken,
  hashPassword,
} from '../../services/auth/index.js'
import type { Json } from '../../services/db/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  consumeOrganizationInvite,
  findActorMembership,
  findActorMembershipForUpdate,
  findEnabledLocalCredentialByEmail,
  findInviteContextByTokenHash,
  findInviteContextByTokenHashForUpdate,
  findInviteContextByIdForUpdate,
  findMembershipStateForInvite,
  findOrganizationInviteForUpdate,
  insertOrganizationInvite,
  insertOrganizationLocalCredential,
  insertOrganizationMembershipForInvite,
  listOrganizationInvites,
  revokeOrganizationInvite,
} from '../../services/organization-invites/index.js'
import {
  insertAuthenticationEvent,
  normalizeLocalLoginEmail,
  upsertLocalMembershipGrant,
} from '../../services/organization-local-auth/index.js'
import {
  canonicalizeOidcIssuer,
  findOidcIdentity,
  findOrganizationOidcProviderContextById,
  insertOidcIdentity,
  revokeActiveOidcMembershipLink,
  updateOidcIdentityClaims,
  upsertOidcMembershipGrant,
  upsertOidcMembershipLink,
} from '../../services/organization-oidc-auth/index.js'
import {
  insertAuditEvent,
  upsertOrganizationMemberProfile,
  upsertUserProfile,
} from '../../services/profiles/index.js'
import { findUserById, insertUser } from '../../services/users/index.js'
import type {
  CompleteOrganizationOidcResult,
  OrganizationOidcInviteCompletionContext,
} from '../organization-oidc-auth/callback.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const LEGACY_INVITE_EMAIL = 'single-use-invite@invalid.local'

export type OrganizationInviteError =
  | { type: 'AUTH_DASHBOARD_FORBIDDEN' }
  | { type: 'AUTH_ORGANIZATION_FORBIDDEN' }
  | { type: 'INVITE_NOT_FOUND' }
  | { type: 'INVITE_INVALID' }
  | { type: 'INVITE_EXPIRED' }
  | { type: 'INVITE_ALREADY_REDEEMED' }
  | { type: 'INVITE_ALREADY_REVOKED' }
  | { type: 'INVITE_ALREADY_MEMBER' }
  | { type: 'INVITE_MEMBERSHIP_SUSPENDED' }
  | { type: 'AUTH_METHOD_NOT_ALLOWED' }
  | { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' }
  | { type: 'INVITE_NEW_USER_PROFILE_REQUIRED' }
  | { type: 'INVITE_EXISTING_USER_PROFILE_NOT_ALLOWED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'MEMBERSHIP_PROFILE_UNAVAILABLE' }

type Result<T> = { ok: true; value: T } | { ok: false; error: OrganizationInviteError }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const baseExecutor = executor ?? db
  return 'transaction' in baseExecutor
    ? baseExecutor.transaction().execute((trx) => callback(trx))
    : callback(baseExecutor)
}

const requireUser = (actor: RequestActor) =>
  actor.type === 'user'
    ? ({ ok: true, actor } as const)
    : ({ ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } } as const)

const permittedRoles = (role: string): InviteRole[] => {
  if (role === 'owner') return ['member', 'manager']
  if (role === 'manager') return ['member']
  return []
}

const requireIssuer = async (
  actor: RequestActor,
  organizationId: string,
  inviteRole: InviteRole | undefined,
  executor: DbExecutor,
  lock: boolean
) => {
  const user = requireUser(actor)
  if (!user.ok) return user
  const membership = lock
    ? await findActorMembershipForUpdate(organizationId, user.actor.user_id, executor)
    : await findActorMembership(organizationId, user.actor.user_id, executor)
  if (!membership?.id || membership.status !== 'active') {
    return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } } as const
  }
  const activeMembership = { ...membership, id: membership.id }
  const allowed = permittedRoles(membership.role)
  if (allowed.length === 0 || (inviteRole && !allowed.includes(inviteRole))) {
    return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } } as const
  }
  return { ok: true, user: user.actor, membership: activeMembership, allowed } as const
}

const inviteStatus = (
  invite: {
    redeemed_at: Date | null
    revoked_at: Date | null
    expires_at: Date
  },
  now: Date
) => {
  if (invite.redeemed_at) return 'redeemed' as const
  if (invite.revoked_at) return 'revoked' as const
  if (invite.expires_at <= now) return 'expired' as const
  return 'active' as const
}

const insertInvite = async (
  organizationId: string,
  role: InviteRole,
  actorUserId: string,
  actorMembershipId: string,
  now: Date,
  executor: DbExecutor
) => {
  const token = generateActivationToken()
  const invite = await insertOrganizationInvite(
    {
      organization_id: organizationId,
      token_hash: hashActivationToken(token),
      role,
      expires_at: new Date(now.getTime() + INVITE_TTL_MS),
      revoked_at: null,
      redeemed_at: null,
      redeemed_membership_id: null,
      created_by_membership_id: actorMembershipId,
      created_by_user_id: actorUserId,
      email: LEGACY_INVITE_EMAIL,
      max_uses: 1,
      used_count: 0,
    },
    executor
  )
  return { token, invite }
}

export const issueOrganizationInvite = async (
  actor: RequestActor,
  organizationId: string,
  payload: CreateOrganizationInviteRequest,
  now = new Date(),
  executor?: DbExecutor
): Promise<Result<{ token: string; expires_at: string }>> =>
  runInTransaction(executor, async (trx) => {
    const issuer = await requireIssuer(actor, organizationId, payload.role, trx, true)
    if (!issuer.ok) return issuer
    const created = await insertInvite(
      organizationId,
      payload.role,
      issuer.user.user_id,
      issuer.membership.id,
      now,
      trx
    )
    await insertAuditEvent(
      {
        actor_user_id: issuer.user.user_id,
        actor_membership_id: issuer.membership.id,
        organization_id: organizationId,
        target_type: 'organization_invite',
        target_id: created.invite.id,
        action: 'issue',
        changed_fields: ['role', 'expires_at'],
        before_values: null,
        after_values: {
          role: payload.role,
          expires_at: created.invite.expires_at.toISOString(),
        } as Json,
      },
      trx
    )
    return {
      ok: true,
      value: { token: created.token, expires_at: created.invite.expires_at.toISOString() },
    }
  })

export const getOrganizationInvites = async (
  actor: RequestActor,
  organizationId: string,
  now = new Date(),
  executor?: DbExecutor
) => {
  const issuer = await requireIssuer(actor, organizationId, undefined, executor ?? db, false)
  if (!issuer.ok) return issuer
  const invites = await listOrganizationInvites(organizationId, issuer.allowed, executor)
  return {
    ok: true,
    value: {
      invites: invites.map((invite) => ({
        id: invite.id,
        role: invite.role as InviteRole,
        status: inviteStatus(invite, now),
        expires_at: invite.expires_at.toISOString(),
        created_at: invite.created_at.toISOString(),
      })),
    },
  } as const
}

const lockedInviteForActor = async (
  actor: RequestActor,
  organizationId: string,
  inviteId: string,
  executor: DbExecutor
) => {
  const invite = await findOrganizationInviteForUpdate(organizationId, inviteId, executor)
  if (!invite) return { ok: false, error: { type: 'INVITE_NOT_FOUND' } } as const
  const issuer = await requireIssuer(
    actor,
    organizationId,
    invite.role as InviteRole,
    executor,
    true
  )
  if (!issuer.ok) return issuer
  return { ok: true, invite, issuer } as const
}

export const revokeInvite = async (
  actor: RequestActor,
  organizationId: string,
  inviteId: string,
  now = new Date(),
  executor?: DbExecutor
): Promise<Result<{ revoked: true }>> =>
  runInTransaction(executor, async (trx) => {
    const context = await lockedInviteForActor(actor, organizationId, inviteId, trx)
    if (!context.ok) return context
    if (context.invite.redeemed_at) return { ok: false, error: { type: 'INVITE_ALREADY_REDEEMED' } }
    if (context.invite.revoked_at) return { ok: false, error: { type: 'INVITE_ALREADY_REVOKED' } }
    const revoked = await revokeOrganizationInvite(inviteId, now, trx)
    if (!revoked) return { ok: false, error: { type: 'INVITE_INVALID' } }
    await insertAuditEvent(
      {
        actor_user_id: context.issuer.user.user_id,
        actor_membership_id: context.issuer.membership.id,
        organization_id: organizationId,
        target_type: 'organization_invite',
        target_id: inviteId,
        action: 'revoke',
        changed_fields: ['revoked_at'],
        before_values: { revoked_at: null } as Json,
        after_values: { revoked_at: now.toISOString() } as Json,
      },
      trx
    )
    return { ok: true, value: { revoked: true } }
  })

export const reissueInvite = async (
  actor: RequestActor,
  organizationId: string,
  inviteId: string,
  now = new Date(),
  executor?: DbExecutor
): Promise<Result<{ token: string; expires_at: string }>> =>
  runInTransaction(executor, async (trx) => {
    const context = await lockedInviteForActor(actor, organizationId, inviteId, trx)
    if (!context.ok) return context
    if (context.invite.redeemed_at) return { ok: false, error: { type: 'INVITE_ALREADY_REDEEMED' } }
    if (context.invite.revoked_at) return { ok: false, error: { type: 'INVITE_ALREADY_REVOKED' } }
    const revoked = await revokeOrganizationInvite(inviteId, now, trx)
    if (!revoked) return { ok: false, error: { type: 'INVITE_INVALID' } }
    const created = await insertInvite(
      organizationId,
      context.invite.role as InviteRole,
      context.issuer.user.user_id,
      context.issuer.membership.id,
      now,
      trx
    )
    await insertAuditEvent(
      {
        actor_user_id: context.issuer.user.user_id,
        actor_membership_id: context.issuer.membership.id,
        organization_id: organizationId,
        target_type: 'organization_invite',
        target_id: created.invite.id,
        action: 'reissue',
        changed_fields: ['revoked_at', 'replacement_invite_id'],
        before_values: { invite_id: inviteId } as Json,
        after_values: { invite_id: created.invite.id } as Json,
      },
      trx
    )
    return {
      ok: true,
      value: { token: created.token, expires_at: created.invite.expires_at.toISOString() },
    }
  })

const validateInviteContext = (
  context: Awaited<ReturnType<typeof findInviteContextByTokenHash>>,
  now: Date
) => {
  if (
    !context ||
    context.revoked_at ||
    context.organization_status !== 'active' ||
    (context.role !== 'member' && context.role !== 'manager')
  ) {
    return { ok: false, error: { type: 'INVITE_INVALID' } } as const
  }
  if (context.redeemed_at) return { ok: false, error: { type: 'INVITE_ALREADY_REDEEMED' } } as const
  if (context.expires_at <= now) return { ok: false, error: { type: 'INVITE_EXPIRED' } } as const
  return { ok: true, context } as const
}

export const verifyOrganizationInvite = async (
  token: string,
  now = new Date(),
  executor?: DbExecutor
) => {
  const valid = validateInviteContext(
    await findInviteContextByTokenHash(hashActivationToken(token), executor),
    now
  )
  if (!valid.ok) return valid
  return {
    ok: true,
    value: {
      organization: { name: valid.context.organization_name },
      role: valid.context.role as InviteRole,
      expires_at: valid.context.expires_at.toISOString(),
      authentication_methods: {
        local: valid.context.local_auth_enabled === true,
        oidc: valid.context.oidc_auth_enabled === true,
      },
    },
  } as const
}

const membershipConflict = (status: string | null) => {
  if (status === 'active') return { type: 'INVITE_ALREADY_MEMBER' } as const
  if (status === 'suspended') return { type: 'INVITE_MEMBERSHIP_SUSPENDED' } as const
  return undefined
}

export interface InviteAcceptanceMetadata {
  requestId?: string
  userAgent?: string
}

export const acceptOrganizationInviteWithLocalCredential = async (
  sessionToken: string | undefined,
  payload: AcceptLocalOrganizationInviteRequest,
  metadata: InviteAcceptanceMetadata = {},
  now = new Date(),
  executor?: DbExecutor
): Promise<
  Result<{
    sessionToken?: string
    session: { expires_at: string }
    membership: { id: string; organization_id: string; role: InviteRole; status: 'active' }
    grant: { auth_method: 'local'; authenticated_at: string; expires_at: string }
  }>
> => {
  // Argon2は高コストなので、無効token/policyを軽量なreadで先に拒否する。
  // 正しさはtransaction内のFOR UPDATE + 再検証で保証する。
  const tokenHash = hashActivationToken(payload.token)
  const prechecked = validateInviteContext(
    await findInviteContextByTokenHash(tokenHash, executor),
    now
  )
  if (!prechecked.ok) return prechecked
  if (!prechecked.context.local_auth_enabled) {
    return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } }
  }
  const passwordHash = await hashPassword(payload.password)
  return runInTransaction(executor, async (trx) => {
    const valid = validateInviteContext(
      await findInviteContextByTokenHashForUpdate(tokenHash, trx),
      now
    )
    if (!valid.ok) return valid
    if (!valid.context.local_auth_enabled)
      return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } }

    let userId: string
    let activeSession
    let createdSessionToken: string | undefined
    if (sessionToken) {
      if (payload.contact_email !== undefined || payload.profile !== undefined) {
        return { ok: false, error: { type: 'INVITE_EXISTING_USER_PROFILE_NOT_ALLOWED' } }
      }
      const foundSession = await findValidSessionByToken(sessionToken, now, trx)
      if (!foundSession.ok) {
        return {
          ok: false,
          error: {
            type:
              foundSession.error === 'SESSION_EXPIRED'
                ? 'AUTH_SESSION_EXPIRED'
                : 'AUTH_SESSION_REVOKED',
          },
        }
      }
      activeSession = foundSession.session
      userId = activeSession.user_id
      const user = await findUserById(userId, trx)
      if (user?.status !== 'active') return { ok: false, error: { type: 'AUTH_USER_DISABLED' } }
    } else {
      if (!payload.contact_email || !payload.profile) {
        return { ok: false, error: { type: 'INVITE_NEW_USER_PROFILE_REQUIRED' } }
      }
      userId = randomUUID()
    }

    const priorMembership = await findMembershipStateForInvite(
      valid.context.organization_id,
      userId,
      trx
    )
    const conflict = membershipConflict(priorMembership?.status ?? null)
    if (conflict) return { ok: false, error: conflict }

    const normalizedLoginEmail = normalizeLocalLoginEmail(payload.login_email)
    if (
      await findEnabledLocalCredentialByEmail(
        valid.context.organization_id,
        normalizedLoginEmail,
        trx
      )
    ) {
      return { ok: false, error: { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' } }
    }

    if (!sessionToken) {
      const profile = payload.profile
      const contactEmail = payload.contact_email
      if (!profile || !contactEmail) {
        return { ok: false, error: { type: 'INVITE_NEW_USER_PROFILE_REQUIRED' } }
      }
      const normalizedContactEmail = contactEmail.trim()
      await insertUser(
        {
          id: userId,
          email: `${userId}@invite.local.invalid`,
          display_name: profile.display_name,
          password_hash: null,
          password_changed_at: null,
          status: 'active',
          global_role: 'none',
          contact_email: normalizedContactEmail,
          normalized_contact_email: normalizedContactEmail.toLowerCase(),
          contact_email_verified_at: null,
          locked_until: null,
        },
        trx
      )
      await upsertUserProfile(
        {
          user_id: userId,
          display_name: profile.display_name,
          locale: profile.locale,
          timezone: profile.timezone,
        },
        profile,
        trx
      )
    }

    const membership = await insertOrganizationMembershipForInvite(
      {
        id: randomUUID(),
        organization_id: valid.context.organization_id,
        user_id: userId,
        role: valid.context.role,
        status: 'active',
        joined_at: now,
        left_at: null,
      },
      trx
    )
    if (!membership.id) return { ok: false, error: { type: 'MEMBERSHIP_PROFILE_UNAVAILABLE' } }
    await upsertOrganizationMemberProfile(
      {
        membership_id: membership.id,
        display_name: null,
        height_meters: null,
        stride_length_meters: null,
      },
      { display_name: null, height_meters: null, stride_length_meters: null },
      trx
    )
    const credential = await insertOrganizationLocalCredential(
      {
        membership_id: membership.id,
        organization_id: valid.context.organization_id,
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
    if (!(await consumeOrganizationInvite(valid.context.invite_id, membership.id, now, trx))) {
      return { ok: false, error: { type: 'INVITE_INVALID' } }
    }

    if (!activeSession) {
      const created = await createSession({ authMethod: 'password', userId, now }, trx)
      activeSession = created.session
      createdSessionToken = created.token
    }
    const grantExpiresAt = new Date(
      now.getTime() + (valid.context.membership_grant_ttl_seconds ?? 0) * 1000
    )
    const grant = await upsertLocalMembershipGrant(
      {
        session_id: activeSession.id,
        membership_id: membership.id,
        user_id: userId,
        auth_method: 'local',
        policy_version: valid.context.policy_version ?? 1,
        local_credential_id: credential.id,
        member_oidc_identity_id: null,
        authenticated_at: now,
        expires_at: grantExpiresAt,
        revoked_at: null,
      },
      trx
    )
    await insertAuthenticationEvent(
      {
        event_type: 'local_invite_accept',
        outcome: 'success',
        user_id: userId,
        organization_id: valid.context.organization_id,
        membership_id: membership.id,
        session_id: activeSession.id,
        auth_method: 'local',
        credential_reference_id: credential.id,
        request_id: metadata.requestId ?? null,
        user_agent: metadata.userAgent ?? null,
      },
      trx
    )
    return {
      ok: true,
      value: {
        sessionToken: createdSessionToken,
        session: { expires_at: activeSession.expires_at.toISOString() },
        membership: {
          id: membership.id,
          organization_id: membership.organization_id,
          role: membership.role as InviteRole,
          status: 'active',
        },
        grant: {
          auth_method: 'local',
          authenticated_at: grant.authenticated_at.toISOString(),
          expires_at: grant.expires_at.toISOString(),
        },
      },
    }
  })
}

export const acceptOrganizationInviteWithOidc = async (
  context: OrganizationOidcInviteCompletionContext
): Promise<CompleteOrganizationOidcResult> =>
  runInTransaction(context.executor, async (trx) => {
    const valid = validateInviteContext(
      await findInviteContextByIdForUpdate(context.inviteId, context.organizationId, trx),
      context.now
    )
    if (!valid.ok) {
      return { ...valid, return_to: context.returnTo }
    }
    if (!valid.context.oidc_auth_enabled) {
      return {
        ok: false,
        error: { type: 'AUTH_METHOD_NOT_ALLOWED' },
        return_to: context.returnTo,
      }
    }

    const provider = await findOrganizationOidcProviderContextById(context.providerId, trx)
    if (
      provider?.organization_id !== valid.context.organization_id ||
      provider.organization_status !== 'active' ||
      !provider.oidc_auth_enabled ||
      !provider.provider_enabled
    ) {
      return {
        ok: false,
        error: { type: 'AUTH_METHOD_NOT_ALLOWED' },
        return_to: context.returnTo,
      }
    }

    let activeSession
    if (context.transactionSessionId) {
      if (!context.callbackSessionToken) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: context.returnTo,
        }
      }
      const foundSession = await findValidSessionByToken(
        context.callbackSessionToken,
        context.now,
        trx
      )
      if (!foundSession.ok || foundSession.session.id !== context.transactionSessionId) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: context.returnTo,
        }
      }
      activeSession = foundSession.session
    } else if (context.callbackSessionToken) {
      return {
        ok: false,
        error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
        return_to: context.returnTo,
      }
    }

    const issuer = canonicalizeOidcIssuer(context.claims.issuer)
    let identity = await findOidcIdentity(issuer, context.claims.sub, trx)
    if (identity && activeSession && identity.user_id !== activeSession.user_id) {
      return {
        ok: false,
        error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
        return_to: context.returnTo,
      }
    }

    const existingUserId = identity?.user_id ?? activeSession?.user_id
    const userId = existingUserId ?? randomUUID()
    if (existingUserId) {
      const user = await findUserById(userId, trx)
      if (user?.status !== 'active') {
        return {
          ok: false,
          error: { type: 'AUTH_USER_DISABLED' },
          return_to: context.returnTo,
        }
      }
    }

    // Membership conflict is checked before creating any User/Identity rows. Returning an
    // expected conflict must not leave callback-side mutations committed.
    const priorMembership = await findMembershipStateForInvite(
      valid.context.organization_id,
      userId,
      trx
    )
    const conflict = membershipConflict(priorMembership?.status ?? null)
    if (conflict) {
      return { ok: false, error: conflict, return_to: context.returnTo }
    }

    if (!existingUserId) {
      const displayName = context.claims.name.trim()
      const contactEmail = context.claims.email.trim()
      await insertUser(
        {
          id: userId,
          email: `${userId}@invite.local.invalid`,
          display_name: displayName,
          password_hash: null,
          password_changed_at: null,
          status: 'active',
          global_role: 'none',
          contact_email: contactEmail,
          normalized_contact_email: contactEmail.toLowerCase(),
          contact_email_verified_at: context.now,
          locked_until: null,
        },
        trx
      )
      await upsertUserProfile(
        {
          user_id: userId,
          display_name: displayName,
          locale: 'ja-JP',
          timezone: 'Asia/Tokyo',
        },
        { display_name: displayName, locale: 'ja-JP', timezone: 'Asia/Tokyo' },
        trx
      )
    }

    if (!identity) {
      identity = await insertOidcIdentity(
        {
          user_id: userId,
          issuer,
          subject: context.claims.sub,
          last_claimed_email: context.claims.email,
          last_claimed_email_verified: context.claims.emailVerified,
        },
        trx
      )
    } else {
      identity = await updateOidcIdentityClaims(
        identity.id,
        {
          last_claimed_email: context.claims.email,
          last_claimed_email_verified: context.claims.emailVerified,
        },
        trx
      )
    }

    const membership = await insertOrganizationMembershipForInvite(
      {
        id: randomUUID(),
        organization_id: valid.context.organization_id,
        user_id: userId,
        role: valid.context.role,
        status: 'active',
        joined_at: context.now,
        left_at: null,
      },
      trx
    )
    if (!membership.id) {
      // This cannot occur for newly inserted rows. Throw so an executor supplied by an
      // outer transaction also observes the failure and rolls the whole acceptance back.
      throw new Error('Inserted Organization Membership has no id')
    }
    await upsertOrganizationMemberProfile(
      {
        membership_id: membership.id,
        display_name: null,
        height_meters: null,
        stride_length_meters: null,
      },
      { display_name: null, height_meters: null, stride_length_meters: null },
      trx
    )

    await revokeActiveOidcMembershipLink(provider.provider_id, identity.id, context.now, trx)
    const link = await upsertOidcMembershipLink(
      {
        membership_id: membership.id,
        organization_id: valid.context.organization_id,
        user_id: userId,
        organization_oidc_provider_id: provider.provider_id,
        oidc_identity_id: identity.id,
        revoked_at: null,
      },
      trx
    )
    if (
      !(await consumeOrganizationInvite(valid.context.invite_id, membership.id, context.now, trx))
    ) {
      // The locked Invite was revalidated above, so a conditional consume miss signals an
      // invariant violation. Propagate it to guarantee rollback instead of committing links.
      throw new Error('Locked Organization Invite could not be consumed')
    }

    let createdSessionToken: string | undefined
    if (!activeSession) {
      const created = await createSession({ authMethod: 'oidc', userId, now: context.now }, trx)
      activeSession = created.session
      createdSessionToken = created.token
    }
    await upsertOidcMembershipGrant(
      {
        session_id: activeSession.id,
        membership_id: membership.id,
        user_id: userId,
        auth_method: 'oidc',
        policy_version: provider.policy_version,
        local_credential_id: null,
        member_oidc_identity_id: link.id,
        authenticated_at: context.now,
        expires_at: new Date(context.now.getTime() + provider.membership_grant_ttl_seconds * 1000),
        revoked_at: null,
      },
      trx
    )
    await insertAuthenticationEvent(
      {
        event_type: 'oidc_invite_accept',
        outcome: 'success',
        user_id: userId,
        organization_id: valid.context.organization_id,
        membership_id: membership.id,
        session_id: activeSession.id,
        auth_method: 'oidc',
        credential_reference_id: identity.id,
      },
      trx
    )

    return {
      ok: true,
      value: {
        return_to: context.returnTo,
        sessionToken: createdSessionToken,
      },
    }
  })
