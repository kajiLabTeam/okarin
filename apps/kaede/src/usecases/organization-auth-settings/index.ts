import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { UpdateOrganizationAuthSettingsRequest } from '../../schemas/organization-auth-settings.js'
import type { Json } from '../../services/db/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  countEnabledOidcProviders,
  findActiveOwnerMembership,
  findActiveOwnerMembershipForUpdate,
  findOrganizationAuthSettings,
  findOrganizationAuthSettingsForUpdate,
  insertOrganizationAuthSettingsAuditEvent,
  updateOrganizationAuthSettings,
} from '../../services/organization-auth-settings/index.js'

export type OrganizationAuthSettingsError =
  | { type: 'AUTH_DASHBOARD_FORBIDDEN' }
  | { type: 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND' }
  | { type: 'ORGANIZATION_AUTH_SETTINGS_INVALID' }
  | { type: 'OIDC_PROVIDER_REQUIRED' }

type Result<T> = { ok: true; value: T } | { ok: false; error: OrganizationAuthSettingsError }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const baseExecutor = executor ?? db
  return 'transaction' in baseExecutor
    ? baseExecutor.transaction().execute((trx) => callback(trx))
    : callback(baseExecutor)
}

const toResponse = (settings: {
  organization_id: string
  local_auth_enabled: boolean
  oidc_auth_enabled: boolean
  policy_version: string
  membership_grant_ttl_seconds: number
  reauthentication_interval_seconds: number
  created_at: Date
  updated_at: Date
}) => ({
  organization_id: settings.organization_id,
  local_auth_enabled: settings.local_auth_enabled,
  oidc_auth_enabled: settings.oidc_auth_enabled,
  policy_version: Number(settings.policy_version),
  membership_grant_ttl_seconds: settings.membership_grant_ttl_seconds,
  reauthentication_interval_seconds: settings.reauthentication_interval_seconds,
  created_at: settings.created_at.toISOString(),
  updated_at: settings.updated_at.toISOString(),
})

const requireUserId = (actor: RequestActor): string | undefined =>
  actor.type === 'user' ? actor.user_id : undefined

export const getOrganizationAuthSettings = async (
  actor: RequestActor,
  organizationId: string,
  executor: DbExecutor = db
): Promise<Result<ReturnType<typeof toResponse>>> => {
  const userId = requireUserId(actor)
  if (!userId || !(await findActiveOwnerMembership(organizationId, userId, executor))) {
    return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } }
  }

  const settings = await findOrganizationAuthSettings(organizationId, executor)
  if (!settings) {
    return { ok: false, error: { type: 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND' } }
  }
  return { ok: true, value: toResponse(settings) }
}

export const patchOrganizationAuthSettings = async (
  actor: RequestActor,
  organizationId: string,
  payload: UpdateOrganizationAuthSettingsRequest,
  executor?: DbExecutor
): Promise<Result<ReturnType<typeof toResponse>>> => {
  const userId = requireUserId(actor)
  if (!userId) return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } }

  return runInTransaction(executor, async (trx) => {
    // Provider管理を含むowner操作と同じ順序でlockし、role/status変更とも直列化する。
    const owner = await findActiveOwnerMembershipForUpdate(organizationId, userId, trx)
    if (!owner) return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } }

    const current = await findOrganizationAuthSettingsForUpdate(organizationId, trx)
    if (!current) {
      return { ok: false, error: { type: 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND' } }
    }

    const next = {
      local_auth_enabled: payload.local_auth_enabled ?? current.local_auth_enabled,
      oidc_auth_enabled: payload.oidc_auth_enabled ?? current.oidc_auth_enabled,
      membership_grant_ttl_seconds:
        payload.membership_grant_ttl_seconds ?? current.membership_grant_ttl_seconds,
      reauthentication_interval_seconds:
        payload.reauthentication_interval_seconds ?? current.reauthentication_interval_seconds,
    }

    if (
      (!next.local_auth_enabled && !next.oidc_auth_enabled) ||
      next.membership_grant_ttl_seconds <= 0 ||
      next.reauthentication_interval_seconds <= 0 ||
      next.reauthentication_interval_seconds > next.membership_grant_ttl_seconds
    ) {
      return { ok: false, error: { type: 'ORGANIZATION_AUTH_SETTINGS_INVALID' } }
    }

    if (
      !current.oidc_auth_enabled &&
      next.oidc_auth_enabled &&
      (await countEnabledOidcProviders(organizationId, trx)) === 0
    ) {
      return { ok: false, error: { type: 'OIDC_PROVIDER_REQUIRED' } }
    }

    const changedFields = (Object.keys(next) as (keyof typeof next)[]).filter(
      (field) => current[field] !== next[field]
    )
    if (changedFields.length === 0) return { ok: true, value: toResponse(current) }

    const updated = await updateOrganizationAuthSettings(organizationId, next, trx)
    const beforeValues = Object.fromEntries(changedFields.map((field) => [field, current[field]]))
    const afterValues = Object.fromEntries(changedFields.map((field) => [field, updated[field]]))
    await insertOrganizationAuthSettingsAuditEvent(
      {
        actor_user_id: userId,
        actor_membership_id: owner.id,
        organization_id: organizationId,
        target_type: 'organization_auth_settings',
        target_id: organizationId,
        action: 'update',
        changed_fields: changedFields,
        before_values: {
          ...beforeValues,
          policy_version: Number(current.policy_version),
        } as Json,
        after_values: {
          ...afterValues,
          policy_version: Number(updated.policy_version),
        } as Json,
      },
      trx
    )

    return { ok: true, value: toResponse(updated) }
  })
}
