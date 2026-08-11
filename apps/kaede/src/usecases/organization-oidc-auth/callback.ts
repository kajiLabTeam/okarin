import type { GoogleIdTokenClaims } from '../../services/auth/index.js'
import { createSession, findValidSessionByToken } from '../../services/auth/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  canonicalizeOidcIssuer,
  claimOidcLoginTransaction,
  decryptPkceCodeVerifier,
  findActiveMembershipByOrganizationAndUser,
  findActiveOidcMembershipLink,
  findOidcIdentity,
  findOrganizationOidcProviderContextById,
  findValidSessionById,
  hashOidcState,
  insertOidcAuthenticationEvent,
  insertOidcIdentity,
  isGoogleIssuer,
  isHostedDomainAllowed,
  oidcLoginTransactionStateExists,
  updateOidcIdentityClaims,
  upsertOidcMembershipGrant,
  upsertOidcMembershipLink,
} from '../../services/organization-oidc-auth/index.js'

export const isOrganizationOidcTransactionState = (state: string, executor: DbExecutor = db) =>
  oidcLoginTransactionStateExists(hashOidcState(state), executor)

export interface OrganizationOidcCallbackClient {
  exchangeCodeForIdToken(params: { code: string; codeVerifier: string }): Promise<string>
  verifyIdToken(params: { idToken: string; nonce: string }): Promise<GoogleIdTokenClaims>
}

export interface OrganizationOidcInviteCompletionContext {
  inviteId: string
  organizationId: string
  providerId: string
  transactionSessionId: string | null
  callbackSessionToken?: string
  claims: GoogleIdTokenClaims
  returnTo: string
  now: Date
  executor: DbExecutor
}

export type CompleteOrganizationOidcInvite = (
  context: OrganizationOidcInviteCompletionContext
) => Promise<CompleteOrganizationOidcResult>

export interface CompleteOrganizationOidcOptions {
  client: OrganizationOidcCallbackClient
  configuredClientId: string
  transactionSecret: string
  sessionToken?: string
  completeInvite?: CompleteOrganizationOidcInvite
  now?: Date
  executor?: DbExecutor
}

export type CompleteOrganizationOidcError =
  | { type: 'OIDC_TRANSACTION_INVALID' }
  | { type: 'OIDC_PROVIDER_ERROR' }
  | { type: 'OIDC_PROVIDER_CONFIG_INVALID' }
  | { type: 'OIDC_HOSTED_DOMAIN_NOT_ALLOWED' }
  | { type: 'OIDC_EMAIL_UNVERIFIED' }
  | { type: 'OIDC_IDENTITY_NOT_LINKED' }
  | { type: 'OIDC_INVITE_COMPLETION_REQUIRED' }
  | { type: 'AUTH_IDENTITY_USER_MISMATCH' }
  | { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' }
  | { type: 'AUTH_SESSION_REQUIRED' }
  | { type: 'AUTH_USER_DISABLED' }

export type CompleteOrganizationOidcResult =
  | {
      ok: true
      value: {
        return_to: string
        sessionToken?: string
      }
    }
  | {
      ok: false
      error: CompleteOrganizationOidcError
      return_to?: string
    }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
) => {
  const base = executor ?? db
  return 'transaction' in base ? base.transaction().execute(callback) : callback(base)
}

export const completeOrganizationOidc = async (
  code: string | undefined,
  state: string | undefined,
  options: CompleteOrganizationOidcOptions
): Promise<CompleteOrganizationOidcResult> => {
  const now = options.now ?? new Date()
  if (!state) {
    return { ok: false, error: { type: 'OIDC_TRANSACTION_INVALID' } }
  }

  // stateをIdP通信より先に原子的に消費し、同じcallbackを二度処理しない。
  const transaction = await claimOidcLoginTransaction(
    hashOidcState(state),
    now,
    options.executor ?? db
  )
  if (!transaction) {
    return { ok: false, error: { type: 'OIDC_TRANSACTION_INVALID' } }
  }
  if (!code) {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_ERROR' },
      return_to: transaction.return_to,
    }
  }

  const provider = await findOrganizationOidcProviderContextById(
    transaction.organization_oidc_provider_id,
    options.executor ?? db
  )
  if (
    provider?.organization_id !== transaction.organization_id ||
    provider.organization_status !== 'active' ||
    !provider.oidc_auth_enabled ||
    !provider.provider_enabled
  ) {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' },
      return_to: transaction.return_to,
    }
  }
  if (!isGoogleIssuer(provider.issuer) || provider.client_id !== options.configuredClientId) {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' },
      return_to: transaction.return_to,
    }
  }

  let claims: GoogleIdTokenClaims
  try {
    const codeVerifier = decryptPkceCodeVerifier(
      transaction.pkce_code_verifier_ciphertext,
      options.transactionSecret
    )
    const idToken = await options.client.exchangeCodeForIdToken({ code, codeVerifier })
    claims = await options.client.verifyIdToken({ idToken, nonce: transaction.nonce })
  } catch {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_ERROR' },
      return_to: transaction.return_to,
    }
  }

  const issuer = canonicalizeOidcIssuer(claims.issuer)
  if (issuer !== canonicalizeOidcIssuer(provider.issuer)) {
    return {
      ok: false,
      error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' },
      return_to: transaction.return_to,
    }
  }
  if (!claims.emailVerified) {
    return {
      ok: false,
      error: { type: 'OIDC_EMAIL_UNVERIFIED' },
      return_to: transaction.return_to,
    }
  }
  if (!isHostedDomainAllowed(claims.hostedDomain, provider.allowed_hosted_domains)) {
    return {
      ok: false,
      error: { type: 'OIDC_HOSTED_DOMAIN_NOT_ALLOWED' },
      return_to: transaction.return_to,
    }
  }

  if (transaction.intent === 'accept_invite') {
    if (options.completeInvite && transaction.invite_id) {
      return options.completeInvite({
        inviteId: transaction.invite_id,
        organizationId: provider.organization_id,
        providerId: provider.provider_id,
        transactionSessionId: transaction.session_id,
        callbackSessionToken: options.sessionToken,
        claims: { ...claims, issuer },
        returnTo: transaction.return_to,
        now,
        executor: options.executor ?? db,
      })
    }
    return {
      ok: false,
      error: { type: 'OIDC_INVITE_COMPLETION_REQUIRED' },
      return_to: transaction.return_to,
    }
  }

  return runInTransaction(options.executor, async (trx) => {
    if (transaction.intent === 'link_identity') {
      if (!transaction.session_id || !options.sessionToken) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: transaction.return_to,
        } as const
      }
      const session = await findValidSessionByToken(options.sessionToken, now, trx)
      if (!session.ok || session.session.id !== transaction.session_id) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: transaction.return_to,
        } as const
      }
      const membership = await findActiveMembershipByOrganizationAndUser(
        provider.organization_id,
        session.session.user_id,
        trx
      )
      if (!membership?.id) {
        return {
          ok: false,
          error: { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' },
          return_to: transaction.return_to,
        } as const
      }

      const existingIdentity = await findOidcIdentity(issuer, claims.sub, trx)
      if (existingIdentity && existingIdentity.user_id !== session.session.user_id) {
        return {
          ok: false,
          error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
          return_to: transaction.return_to,
        } as const
      }
      const identity = existingIdentity
        ? await updateOidcIdentityClaims(
            existingIdentity.id,
            {
              last_claimed_email: claims.email,
              last_claimed_email_verified: claims.emailVerified,
            },
            trx
          )
        : await insertOidcIdentity(
            {
              user_id: session.session.user_id,
              issuer,
              subject: claims.sub,
              last_claimed_email: claims.email,
              last_claimed_email_verified: claims.emailVerified,
            },
            trx
          )
      await upsertOidcMembershipLink(
        {
          membership_id: membership.id,
          organization_id: provider.organization_id,
          user_id: session.session.user_id,
          organization_oidc_provider_id: provider.provider_id,
          oidc_identity_id: identity.id,
          revoked_at: null,
        },
        trx
      )
      await insertOidcAuthenticationEvent(
        {
          event_type: 'oidc_link_identity',
          outcome: 'success',
          user_id: session.session.user_id,
          organization_id: provider.organization_id,
          membership_id: membership.id,
          session_id: session.session.id,
          auth_method: 'oidc',
          credential_reference_id: identity.id,
        },
        trx
      )
      return { ok: true, value: { return_to: transaction.return_to } } as const
    }

    const identity = await findOidcIdentity(issuer, claims.sub, trx)
    if (!identity) {
      return {
        ok: false,
        error: { type: 'OIDC_IDENTITY_NOT_LINKED' },
        return_to: transaction.return_to,
      } as const
    }
    const link = await findActiveOidcMembershipLink(provider.provider_id, identity.id, trx)
    if (link?.membership_status !== 'active') {
      return {
        ok: false,
        error: { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' },
        return_to: transaction.return_to,
      } as const
    }
    if (link.user_status !== 'active') {
      return {
        ok: false,
        error: { type: 'AUTH_USER_DISABLED' },
        return_to: transaction.return_to,
      } as const
    }

    let session
    let createdSessionToken: string | undefined
    if (transaction.intent === 'reauthenticate') {
      if (!transaction.session_id || !options.sessionToken) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: transaction.return_to,
        } as const
      }
      const cookieSession = await findValidSessionByToken(options.sessionToken, now, trx)
      const transactionSession = await findValidSessionById(transaction.session_id, now, trx)
      if (!cookieSession.ok || cookieSession.session.id !== transactionSession?.id) {
        return {
          ok: false,
          error: { type: 'AUTH_SESSION_REQUIRED' },
          return_to: transaction.return_to,
        } as const
      }
      session = transactionSession
    } else if (options.sessionToken) {
      const existingSession = await findValidSessionByToken(options.sessionToken, now, trx)
      if (existingSession.ok) session = existingSession.session
    }

    if (session && session.user_id !== identity.user_id) {
      return {
        ok: false,
        error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
        return_to: transaction.return_to,
      } as const
    }
    if (!session) {
      const created = await createSession(
        { authMethod: 'oidc', userId: identity.user_id, now },
        trx
      )
      session = created.session
      createdSessionToken = created.token
    }

    const expiresAt = new Date(now.getTime() + provider.membership_grant_ttl_seconds * 1000)
    await upsertOidcMembershipGrant(
      {
        session_id: session.id,
        membership_id: link.membership_id,
        user_id: identity.user_id,
        auth_method: 'oidc',
        policy_version: provider.policy_version,
        local_credential_id: null,
        member_oidc_identity_id: link.link_id,
        authenticated_at: now,
        expires_at: expiresAt,
        revoked_at: null,
      },
      trx
    )
    await updateOidcIdentityClaims(
      identity.id,
      {
        last_claimed_email: claims.email,
        last_claimed_email_verified: claims.emailVerified,
      },
      trx
    )
    await insertOidcAuthenticationEvent(
      {
        event_type: transaction.intent === 'reauthenticate' ? 'oidc_reauthenticate' : 'oidc_login',
        outcome: 'success',
        user_id: identity.user_id,
        organization_id: provider.organization_id,
        membership_id: link.membership_id,
        session_id: session.id,
        auth_method: 'oidc',
        credential_reference_id: identity.id,
      },
      trx
    )

    return {
      ok: true,
      value: {
        return_to: transaction.return_to,
        sessionToken: createdSessionToken,
      },
    } as const
  })
}
