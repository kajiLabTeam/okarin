import type { MembershipRole } from '../../schemas/common.js'
import type { MembershipGrantAuthMethod, MembershipGrantContext } from './repository.js'

export type MembershipReauthenticationReason =
  | 'grant_missing'
  | 'grant_revoked'
  | 'grant_expired'
  | 'reauthentication_interval_elapsed'
  | 'policy_changed'
  | 'auth_method_not_allowed'

export type MembershipGrantAuthorization =
  | {
      ok: true
      membershipId: string
      role: MembershipRole
      authMethod: MembershipGrantAuthMethod
      authenticatedAt: Date
      expiresAt: Date
    }
  | { ok: false; type: 'organization_forbidden' }
  | { ok: false; type: 'role_forbidden'; membershipId: string }
  | {
      ok: false
      type: 'reauthentication_required'
      membershipId: string
      reason: MembershipReauthenticationReason
      allowedAuthMethods: MembershipGrantAuthMethod[]
    }

const roleRanks = {
  member: 1,
  manager: 2,
  owner: 3,
} satisfies Record<MembershipRole, number>

const isMembershipRole = (role: string): role is MembershipRole => role in roleRanks

const allowedAuthMethods = (context: MembershipGrantContext): MembershipGrantAuthMethod[] => {
  const methods: MembershipGrantAuthMethod[] = []
  if (context.local_auth_enabled) methods.push('local')
  if (context.oidc_auth_enabled) methods.push('oidc')
  return methods
}

export const evaluateMembershipGrant = (
  context: MembershipGrantContext | undefined,
  requiredRole: MembershipRole,
  now: Date
): MembershipGrantAuthorization => {
  if (
    context?.organization_status !== 'active' ||
    context.membership_status !== 'active' ||
    context.membership_left_at !== null ||
    !isMembershipRole(context.membership_role)
  ) {
    return { ok: false, type: 'organization_forbidden' }
  }

  const reauthenticationRequired = (
    reason: MembershipReauthenticationReason
  ): MembershipGrantAuthorization => ({
    ok: false,
    type: 'reauthentication_required',
    membershipId: context.membership_id,
    reason,
    allowedAuthMethods: allowedAuthMethods(context),
  })

  if (
    !context.grant_auth_method ||
    !context.grant_policy_version ||
    !context.grant_authenticated_at ||
    !context.grant_expires_at
  ) {
    return reauthenticationRequired('grant_missing')
  }
  if (context.grant_revoked_at) return reauthenticationRequired('grant_revoked')
  if (context.grant_expires_at <= now) return reauthenticationRequired('grant_expired')
  if (context.grant_policy_version !== context.current_policy_version) {
    return reauthenticationRequired('policy_changed')
  }

  const localAllowed =
    context.grant_auth_method === 'local' &&
    context.local_auth_enabled &&
    context.local_credential_enabled === true
  const oidcAllowed =
    context.grant_auth_method === 'oidc' &&
    context.oidc_auth_enabled &&
    context.oidc_identity_revoked_at === null &&
    context.oidc_provider_enabled === true
  if (!localAllowed && !oidcAllowed) {
    return reauthenticationRequired('auth_method_not_allowed')
  }

  if (
    context.grant_authenticated_at.getTime() + context.reauthentication_interval_seconds * 1000 <=
    now.getTime()
  ) {
    return reauthenticationRequired('reauthentication_interval_elapsed')
  }

  if (roleRanks[context.membership_role] < roleRanks[requiredRole]) {
    return { ok: false, type: 'role_forbidden', membershipId: context.membership_id }
  }

  return {
    ok: true,
    membershipId: context.membership_id,
    role: context.membership_role,
    authMethod: context.grant_auth_method as MembershipGrantAuthMethod,
    authenticatedAt: context.grant_authenticated_at,
    expiresAt: context.grant_expires_at,
  }
}
