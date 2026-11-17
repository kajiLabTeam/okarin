import { getOidcRuntimeConfig } from '../../config/runtime.js'
import { findGoogleIdentityByUserId } from '../auth/index.js'
import type { DbExecutor } from '../executor.js'
import {
  findActiveOwnerMembershipForUpdate,
  findOrganizationAuthSettingsForUpdate,
  updateOrganizationAuthSettings,
} from '../organization-auth-settings/index.js'
import {
  findOidcIdentity,
  insertOidcAuditEvent,
  insertOidcIdentity,
  insertOidcProvider,
  upsertOidcMembershipLink,
} from '../organization-oidc-auth/index.js'

const issuer = 'https://accounts.google.com'

// Call inside a transaction. Only untouched organizations can be initialized; never
// overwrite an owner's authentication policy or restore a revoked identity link.
export const initializeOwnerOidc = async (
  organizationId: string,
  requesterUserId: string,
  actorUserId: string | null,
  executor: DbExecutor,
  dryRun = false
) => {
  const config = getOidcRuntimeConfig()
  if (!config.enabled) return { status: 'skipped', reason: 'oidc_disabled' } as const

  const owner = await findActiveOwnerMembershipForUpdate(organizationId, requesterUserId, executor)
  if (!owner) return { status: 'skipped', reason: 'requester_is_not_active_owner' } as const
  const user = await executor
    .selectFrom('users')
    .select('status')
    .where('id', '=', requesterUserId)
    .executeTakeFirst()
  if (user?.status !== 'active')
    return { status: 'skipped', reason: 'requester_is_not_active' } as const
  const settings = await findOrganizationAuthSettingsForUpdate(organizationId, executor)
  if (
    settings?.policy_version !== '1' ||
    !settings.local_auth_enabled ||
    settings.oidc_auth_enabled
  ) {
    return { status: 'skipped', reason: 'auth_policy_already_configured' } as const
  }
  const provider = await executor
    .selectFrom('organization_oidc_providers')
    .select('id')
    .where('organization_id', '=', organizationId)
    .executeTakeFirst()
  if (provider) return { status: 'skipped', reason: 'provider_already_configured' } as const

  const identities = await executor
    .selectFrom('oidc_identities')
    .selectAll()
    .where('user_id', '=', requesterUserId)
    .where('issuer', '=', issuer)
    .execute()
  const legacy = await findGoogleIdentityByUserId(requesterUserId, executor)
  let legacyIdentity
  if (legacy?.email_verified) {
    legacyIdentity = await findOidcIdentity(issuer, legacy.provider_subject, executor)
    if (legacyIdentity && legacyIdentity.user_id !== requesterUserId) {
      throw new Error(
        'Google identity belongs to a different user; organization OIDC initialization aborted'
      )
    }
  }
  if (identities.length === 0 && !legacy?.email_verified) {
    return { status: 'skipped', reason: 'requester_has_no_google_identity' } as const
  }
  if (dryRun) return { status: 'ready' } as const

  if (legacy?.email_verified && !legacyIdentity) {
    const identity = await insertOidcIdentity(
      {
        user_id: requesterUserId,
        issuer,
        subject: legacy.provider_subject,
        last_claimed_email: legacy.email,
        last_claimed_email_verified: legacy.email_verified,
      },
      executor
    )
    identities.push(identity)
  }
  const createdProvider = await insertOidcProvider(
    {
      organization_id: organizationId,
      name: 'Google',
      issuer,
      client_id: config.googleClientId,
      client_secret_ref: null,
      scopes: ['openid', 'email', 'profile'],
      allowed_hosted_domains: null,
      enabled: true,
    },
    executor
  )
  for (const identity of identities) {
    await upsertOidcMembershipLink(
      {
        organization_id: organizationId,
        membership_id: owner.id,
        user_id: requesterUserId,
        organization_oidc_provider_id: createdProvider.id,
        oidc_identity_id: identity.id,
        revoked_at: null,
      },
      executor
    )
  }
  await updateOrganizationAuthSettings(organizationId, { oidc_auth_enabled: true }, executor)
  await insertOidcAuditEvent(
    {
      actor_user_id: actorUserId,
      organization_id: organizationId,
      target_type: 'organization_auth_settings',
      target_id: organizationId,
      action: 'initialize_owner_oidc',
      changed_fields: [
        'oidc_auth_enabled',
        'policy_version',
        'organization_oidc_provider',
        'owner_oidc_links',
      ],
      before_values: { oidc_auth_enabled: false, policy_version: 1 },
      after_values: {
        oidc_auth_enabled: true,
        policy_version: 2,
        provider_id: createdProvider.id,
        owner_membership_id: owner.id,
      },
    },
    executor
  )
  return { status: 'initialized', providerId: createdProvider.id } as const
}
