import { findValidSessionByToken } from '../../services/auth/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  findCurrentMembershipForSessionLogout,
  insertOrganizationSessionAuthenticationEvent,
  revokeCurrentSessionMembershipGrant,
} from '../../services/organization-session-auth/index.js'

export type OrganizationSessionLogoutResult =
  | {
      ok: true
      value: { organization_id: string; membership_id: string; revoked: boolean }
    }
  | {
      ok: false
      error: { type: 'AUTH_UNAUTHENTICATED' | 'AUTH_SESSION_EXPIRED' | 'AUTH_SESSION_REVOKED' }
    }
  | { ok: false; error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }

const mapSessionError = (
  error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
): 'AUTH_UNAUTHENTICATED' | 'AUTH_SESSION_EXPIRED' | 'AUTH_SESSION_REVOKED' => {
  if (error === 'SESSION_EXPIRED') return 'AUTH_SESSION_EXPIRED'
  if (error === 'SESSION_REVOKED') return 'AUTH_SESSION_REVOKED'
  return 'AUTH_UNAUTHENTICATED'
}

export const logoutFromOrganization = async (
  organizationId: string,
  sessionToken: string | undefined,
  options: { now?: Date; requestId?: string; userAgent?: string } = {},
  executor?: DbExecutor
): Promise<OrganizationSessionLogoutResult> => {
  if (!sessionToken) return { ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } }

  const base = executor ?? db
  const run = async (trx: DbExecutor) => {
    const now = options.now ?? new Date()
    const sessionResult = await findValidSessionByToken(sessionToken, now, trx)
    if (!sessionResult.ok) {
      return { ok: false, error: { type: mapSessionError(sessionResult.error) } } as const
    }

    const membership = await findCurrentMembershipForSessionLogout(
      organizationId,
      sessionResult.session.user_id,
      trx
    )
    if (!membership) {
      return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } } as const
    }

    const revoked = await revokeCurrentSessionMembershipGrant(
      sessionResult.session.id,
      membership.id,
      sessionResult.session.user_id,
      now,
      trx
    )
    await insertOrganizationSessionAuthenticationEvent(
      {
        event_type: 'organization_logout',
        outcome: 'success',
        user_id: sessionResult.session.user_id,
        organization_id: organizationId,
        membership_id: membership.id,
        session_id: sessionResult.session.id,
        request_id: options.requestId,
        user_agent: options.userAgent,
      },
      trx
    )

    return {
      ok: true,
      value: {
        organization_id: organizationId,
        membership_id: membership.id,
        revoked,
      },
    } as const
  }

  return 'transaction' in base ? base.transaction().execute(run) : run(base)
}
