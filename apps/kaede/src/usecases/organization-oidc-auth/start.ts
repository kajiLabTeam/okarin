import type { OrganizationOidcStartRequest } from '../../schemas/organization-oidc-auth.js'
import {
  findValidSessionByToken,
  generateOidcNonce,
  generateOidcState,
  generatePkceCodeVerifier,
  hashActivationToken,
} from '../../services/auth/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  encryptPkceCodeVerifier,
  findActiveInviteIdByTokenHash,
  findActiveMembershipByOrganizationAndUser,
  findOrganizationOidcProviderContext,
  findRecentMembershipGrant,
  hashOidcState,
  insertOidcLoginTransaction,
  isGoogleIssuer,
} from '../../services/organization-oidc-auth/index.js'

const OIDC_TRANSACTION_TTL_MS = 10 * 60 * 1000

export interface OrganizationOidcAuthorizationClient {
  createAuthorizationUrl(params: { codeVerifier: string; nonce: string; state: string }): string
}

export interface StartOrganizationOidcOptions {
  client: OrganizationOidcAuthorizationClient
  configuredClientId: string
  transactionSecret: string
  now?: Date
  executor?: DbExecutor
}

export type StartOrganizationOidcError =
  | { type: 'AUTH_METHOD_NOT_ALLOWED' }
  | { type: 'AUTH_SESSION_REQUIRED' }
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_ALREADY_EXISTS' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' }
  | { type: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED' }
  | { type: 'OIDC_PROVIDER_NOT_FOUND' }
  | { type: 'OIDC_PROVIDER_CONFIG_INVALID' }
  | { type: 'INVITE_INVALID' }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
) => {
  const base = executor ?? db
  return 'transaction' in base ? base.transaction().execute(callback) : callback(base)
}

const mapSessionError = (
  error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
): StartOrganizationOidcError => {
  switch (error) {
    case 'SESSION_EXPIRED':
      return { type: 'AUTH_SESSION_EXPIRED' }
    case 'SESSION_REVOKED':
      return { type: 'AUTH_SESSION_REVOKED' }
    case 'SESSION_NOT_FOUND':
      return { type: 'AUTH_SESSION_REQUIRED' }
  }
}

export const startOrganizationOidc = async (
  organizationSlug: string,
  providerId: string,
  sessionToken: string | undefined,
  payload: OrganizationOidcStartRequest,
  options: StartOrganizationOidcOptions
) => {
  const now = options.now ?? new Date()

  return runInTransaction(options.executor, async (trx) => {
    const provider = await findOrganizationOidcProviderContext(organizationSlug, providerId, trx)
    if (!provider) {
      return { ok: false, error: { type: 'OIDC_PROVIDER_NOT_FOUND' } } as const
    }
    if (
      provider.organization_status !== 'active' ||
      !provider.oidc_auth_enabled ||
      !provider.provider_enabled
    ) {
      return { ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } } as const
    }
    if (!isGoogleIssuer(provider.issuer) || provider.client_id !== options.configuredClientId) {
      return { ok: false, error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' } } as const
    }

    let sessionId: string | null = null
    let sessionUserId: string | null = null
    if (sessionToken) {
      const session = await findValidSessionByToken(sessionToken, now, trx)
      if (!session.ok) return { ok: false, error: mapSessionError(session.error) } as const
      if (payload.intent === 'login') {
        return { ok: false, error: { type: 'AUTH_SESSION_ALREADY_EXISTS' } } as const
      }
      sessionId = session.session.id
      sessionUserId = session.session.user_id
    }
    if (payload.intent === 'reauthenticate' || payload.intent === 'link_identity') {
      if (!sessionId || !sessionUserId) {
        return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } } as const
      }
      const membership = await findActiveMembershipByOrganizationAndUser(
        provider.organization_id,
        sessionUserId,
        trx
      )
      if (!membership?.id) {
        return { ok: false, error: { type: 'AUTH_MEMBERSHIP_NOT_ACTIVE' } } as const
      }
      if (payload.intent === 'link_identity') {
        const recentAfter = new Date(
          now.getTime() - provider.reauthentication_interval_seconds * 1000
        )
        const recentGrant = await findRecentMembershipGrant(
          sessionId,
          provider.organization_id,
          sessionUserId,
          provider.policy_version,
          recentAfter,
          now,
          trx
        )
        if (!recentGrant) {
          return {
            ok: false,
            error: { type: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED' },
          } as const
        }
      }
    }

    let inviteId: string | null = null
    if (payload.intent === 'accept_invite') {
      if (!payload.invite_token) {
        return { ok: false, error: { type: 'INVITE_INVALID' } } as const
      }
      const invite = await findActiveInviteIdByTokenHash(
        provider.organization_id,
        hashActivationToken(payload.invite_token),
        now,
        trx
      )
      if (!invite) return { ok: false, error: { type: 'INVITE_INVALID' } } as const
      inviteId = invite.id
    }

    const state = generateOidcState()
    const nonce = generateOidcNonce()
    const codeVerifier = generatePkceCodeVerifier()
    await insertOidcLoginTransaction(
      {
        state_hash: hashOidcState(state),
        organization_id: provider.organization_id,
        organization_oidc_provider_id: provider.provider_id,
        session_id:
          payload.intent === 'reauthenticate' ||
          payload.intent === 'link_identity' ||
          payload.intent === 'accept_invite'
            ? sessionId
            : null,
        invite_id: inviteId,
        intent: payload.intent,
        nonce,
        pkce_code_verifier_ciphertext: encryptPkceCodeVerifier(
          codeVerifier,
          options.transactionSecret
        ),
        return_to: payload.return_to ?? '/',
        expected_user_id: payload.intent === 'reauthenticate' ? sessionUserId : null,
        mobile_redirect_uri: payload.mobile?.redirect_uri ?? null,
        mobile_code_challenge: payload.mobile?.code_challenge ?? null,
        mobile_code_challenge_method: payload.mobile?.code_challenge_method ?? null,
        expires_at: new Date(now.getTime() + OIDC_TRANSACTION_TTL_MS),
        consumed_at: null,
      },
      trx
    )

    return {
      ok: true,
      value: {
        authorization_url: options.client.createAuthorizationUrl({
          codeVerifier,
          nonce,
          state,
        }),
      },
    } as const
  })
}
