import type {
  CreateOrganizationOidcProviderRequest,
  UpdateOrganizationOidcProviderRequest,
} from '../../schemas/organization-oidc-auth.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  canonicalizeOidcIssuer,
  findActiveOwnerMembershipForUpdate,
  incrementOrganizationPolicyVersion,
  insertOidcAuditEvent,
  insertOidcProvider,
  listOidcProviders,
  normalizeHostedDomains,
  updateOidcProvider,
} from '../../services/organization-oidc-auth/index.js'

export type OidcProviderManagementError =
  | { type: 'AUTH_FORBIDDEN' }
  | { type: 'OIDC_PROVIDER_NOT_FOUND' }
  | { type: 'OIDC_PROVIDER_CONFIG_INVALID' }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
) => {
  const base = executor ?? db
  return 'transaction' in base ? base.transaction().execute(callback) : callback(base)
}

const toProviderResponse = (provider: {
  id: string
  organization_id: string
  name: string
  issuer: string
  client_id: string
  allowed_hosted_domains: string[] | null
  enabled: boolean
  created_at: Date
  updated_at: Date
}) => ({
  id: provider.id,
  organization_id: provider.organization_id,
  display_name: provider.name,
  issuer: provider.issuer,
  client_id: provider.client_id,
  allowed_hosted_domains: provider.allowed_hosted_domains,
  enabled: provider.enabled,
  created_at: provider.created_at.toISOString(),
  updated_at: provider.updated_at.toISOString(),
})

const requireOwner = async (organizationId: string, userId: string, executor: DbExecutor) => {
  const membership = await findActiveOwnerMembershipForUpdate(organizationId, userId, executor)
  return membership?.id
    ? { ok: true as const, membershipId: membership.id }
    : { ok: false as const }
}

export const getOrganizationOidcProviders = async (
  organizationId: string,
  userId: string,
  executor?: DbExecutor
) =>
  runInTransaction(executor, async (trx) => {
    const owner = await requireOwner(organizationId, userId, trx)
    if (!owner.ok) return { ok: false, error: { type: 'AUTH_FORBIDDEN' } } as const

    const providers = await listOidcProviders(organizationId, trx)
    return { ok: true, value: { providers: providers.map(toProviderResponse) } } as const
  })

export const createOrganizationOidcProvider = async (
  organizationId: string,
  userId: string,
  payload: CreateOrganizationOidcProviderRequest,
  configuredGoogleClientId: string,
  executor?: DbExecutor
) => {
  if (payload.client_id !== configuredGoogleClientId) {
    return { ok: false, error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' } } as const
  }

  let allowedHostedDomains: string[] | null
  try {
    allowedHostedDomains = normalizeHostedDomains(payload.allowed_hosted_domains)
  } catch {
    return { ok: false, error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' } } as const
  }

  return runInTransaction(executor, async (trx) => {
    const owner = await requireOwner(organizationId, userId, trx)
    if (!owner.ok) return { ok: false, error: { type: 'AUTH_FORBIDDEN' } } as const

    const provider = await insertOidcProvider(
      {
        organization_id: organizationId,
        name: payload.display_name,
        issuer: canonicalizeOidcIssuer(payload.issuer),
        client_id: payload.client_id,
        client_secret_ref: null,
        scopes: ['openid', 'email', 'profile'],
        allowed_hosted_domains: allowedHostedDomains,
        enabled: payload.enabled,
      },
      trx
    )
    if (provider.enabled) await incrementOrganizationPolicyVersion(organizationId, trx)
    await insertOidcAuditEvent(
      {
        actor_user_id: userId,
        actor_membership_id: owner.membershipId,
        organization_id: organizationId,
        target_type: 'organization_oidc_provider',
        target_id: provider.id,
        action: 'create',
        changed_fields: ['provider'],
        before_values: null,
        after_values: { enabled: provider.enabled },
      },
      trx
    )

    return { ok: true, value: toProviderResponse(provider) } as const
  })
}

export const patchOrganizationOidcProvider = async (
  organizationId: string,
  providerId: string,
  userId: string,
  payload: UpdateOrganizationOidcProviderRequest,
  configuredGoogleClientId: string,
  executor?: DbExecutor
) => {
  if (payload.client_id && payload.client_id !== configuredGoogleClientId) {
    return { ok: false, error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' } } as const
  }

  let allowedHostedDomains: string[] | null | undefined
  try {
    allowedHostedDomains =
      payload.allowed_hosted_domains === undefined
        ? undefined
        : normalizeHostedDomains(payload.allowed_hosted_domains)
  } catch {
    return { ok: false, error: { type: 'OIDC_PROVIDER_CONFIG_INVALID' } } as const
  }

  return runInTransaction(executor, async (trx) => {
    const owner = await requireOwner(organizationId, userId, trx)
    if (!owner.ok) return { ok: false, error: { type: 'AUTH_FORBIDDEN' } } as const
    const before = (await listOidcProviders(organizationId, trx)).find(
      (provider) => provider.id === providerId
    )
    if (!before) {
      return { ok: false, error: { type: 'OIDC_PROVIDER_NOT_FOUND' } } as const
    }

    const provider = await updateOidcProvider(
      organizationId,
      providerId,
      {
        ...(payload.display_name === undefined ? {} : { name: payload.display_name }),
        ...(payload.issuer === undefined ? {} : { issuer: canonicalizeOidcIssuer(payload.issuer) }),
        ...(payload.client_id === undefined ? {} : { client_id: payload.client_id }),
        ...(allowedHostedDomains === undefined
          ? {}
          : { allowed_hosted_domains: allowedHostedDomains }),
        ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
      },
      trx
    )
    if (!provider) {
      return { ok: false, error: { type: 'OIDC_PROVIDER_NOT_FOUND' } } as const
    }

    const policyChanged =
      before.enabled !== provider.enabled ||
      before.issuer !== provider.issuer ||
      before.client_id !== provider.client_id ||
      JSON.stringify(before.allowed_hosted_domains) !==
        JSON.stringify(provider.allowed_hosted_domains)
    if (policyChanged) await incrementOrganizationPolicyVersion(organizationId, trx)
    await insertOidcAuditEvent(
      {
        actor_user_id: userId,
        actor_membership_id: owner.membershipId,
        organization_id: organizationId,
        target_type: 'organization_oidc_provider',
        target_id: provider.id,
        action: 'update',
        changed_fields: Object.keys(payload),
        before_values: { enabled: before.enabled },
        after_values: { enabled: provider.enabled },
      },
      trx
    )

    return { ok: true, value: toProviderResponse(provider) } as const
  })
}

export const disableOrganizationOidcProvider = async (
  organizationId: string,
  providerId: string,
  userId: string,
  executor?: DbExecutor
) =>
  patchOrganizationOidcProvider(
    organizationId,
    providerId,
    userId,
    { enabled: false },
    '',
    executor
  )
