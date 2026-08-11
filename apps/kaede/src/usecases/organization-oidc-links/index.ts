import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { Json } from '../../services/db/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  countOtherUsableOidcLinks,
  findActiveMembership,
  findActiveMembershipForUpdate,
  findActiveOrganizationOidcLinkForUpdate,
  findOrganizationAuthSettingsForUpdate,
  hasEnabledLocalCredential,
  insertOidcLinkAuditEvent,
  insertOidcLinkAuthenticationEvent,
  listActiveOrganizationOidcLinks,
  revokeActiveGrantsForOidcLink,
  revokeOrganizationOidcLink,
} from '../../services/organization-oidc-links/index.js'

export type OrganizationOidcLinkError =
  | { type: 'AUTH_ORGANIZATION_FORBIDDEN' }
  | { type: 'OIDC_MEMBERSHIP_LINK_NOT_FOUND' }
  | { type: 'OIDC_LINK_LAST_USABLE_AUTH_METHOD' }

type Result<T> = { ok: true; value: T } | { ok: false; error: OrganizationOidcLinkError }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const base = executor ?? db
  return 'transaction' in base ? base.transaction().execute(callback) : callback(base)
}

const userIdFromActor = (actor: RequestActor) => (actor.type === 'user' ? actor.user_id : undefined)

const toLinkResponse = (link: {
  id: string
  linked_at: Date
  provider_id: string
  provider_name: string
  provider_enabled: boolean
}) => ({
  id: link.id,
  provider: {
    id: link.provider_id,
    display_name: link.provider_name,
    enabled: link.provider_enabled,
  },
  linked_at: link.linked_at.toISOString(),
})

export const getMyOrganizationOidcLinks = async (
  actor: RequestActor,
  organizationId: string,
  executor: DbExecutor = db
): Promise<Result<{ links: ReturnType<typeof toLinkResponse>[] }>> => {
  const userId = userIdFromActor(actor)
  if (!userId) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
  const membership = await findActiveMembership(organizationId, userId, executor)
  if (!membership?.id) {
    return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
  }
  const links = await listActiveOrganizationOidcLinks(membership.id, executor)
  return { ok: true, value: { links: links.map(toLinkResponse) } }
}

export const unlinkMyOrganizationOidcIdentity = async (
  actor: RequestActor,
  organizationId: string,
  linkId: string,
  options: { now?: Date; executor?: DbExecutor } = {}
): Promise<Result<{ ok: true }>> => {
  const userId = userIdFromActor(actor)
  if (!userId) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
  const now = options.now ?? new Date()

  return runInTransaction(options.executor, async (trx) => {
    // 本人のMembershipを先にlockし、退出・suspendとunlinkを直列化する。
    const membership = await findActiveMembershipForUpdate(organizationId, userId, trx)
    if (!membership?.id) {
      return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
    }
    const policy = await findOrganizationAuthSettingsForUpdate(organizationId, trx)
    if (!policy) return { ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } }
    const link = await findActiveOrganizationOidcLinkForUpdate(
      organizationId,
      membership.id,
      linkId,
      trx
    )
    if (!link) {
      return { ok: false, error: { type: 'OIDC_MEMBERSHIP_LINK_NOT_FOUND' } }
    }

    const targetIsUsable = policy.oidc_auth_enabled && link.provider_enabled
    if (targetIsUsable) {
      const localRemains =
        policy.local_auth_enabled && (await hasEnabledLocalCredential(membership.id, trx))
      const oidcRemains =
        policy.oidc_auth_enabled &&
        (await countOtherUsableOidcLinks(membership.id, link.id, trx)) > 0
      if (!localRemains && !oidcRemains) {
        return { ok: false, error: { type: 'OIDC_LINK_LAST_USABLE_AUTH_METHOD' } }
      }
    }

    const revoked = await revokeOrganizationOidcLink(link.id, now, trx)
    if (!revoked) {
      return { ok: false, error: { type: 'OIDC_MEMBERSHIP_LINK_NOT_FOUND' } }
    }
    const revokedGrantCount = await revokeActiveGrantsForOidcLink(membership.id, link.id, now, trx)
    await insertOidcLinkAuditEvent(
      {
        actor_user_id: userId,
        actor_membership_id: membership.id,
        organization_id: organizationId,
        target_type: 'organization_member_oidc_identity',
        target_id: link.id,
        action: 'unlink',
        changed_fields: ['revoked_at'],
        before_values: {
          revoked_at: null,
          provider_id: link.provider_id,
          revoked_grant_count: 0,
        } as Json,
        after_values: {
          revoked_at: now.toISOString(),
          provider_id: link.provider_id,
          revoked_grant_count: revokedGrantCount,
        } as Json,
      },
      trx
    )
    await insertOidcLinkAuthenticationEvent(
      {
        event_type: 'oidc_unlink_identity',
        outcome: 'success',
        user_id: userId,
        organization_id: organizationId,
        membership_id: membership.id,
        auth_method: 'oidc',
        credential_reference_id: link.oidc_identity_id,
      },
      trx
    )

    return { ok: true, value: { ok: true } }
  })
}
