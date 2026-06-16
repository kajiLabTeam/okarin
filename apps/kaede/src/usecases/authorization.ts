import type { RequestActor } from '../middleware/request-actor-context.js'
import type { AccountState, MembershipRole } from '../schemas/common.js'

export type AuthorizationError =
  | { type: 'AUTH_DASHBOARD_FORBIDDEN' }
  | { type: 'AUTH_ORGANIZATION_FORBIDDEN' }

export type AuthenticationGateError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_USER_DISABLED' }
  | AuthorizationError

const roleRanks = {
  member: 1,
  manager: 2,
  owner: 3,
} satisfies Record<MembershipRole, number>

const roleAtLeast = (actual: MembershipRole, required: MembershipRole) =>
  roleRanks[actual] >= roleRanks[required]

const findMembership = (actor: RequestActor, organizationId: string) => {
  if (actor.type === 'service_client') {
    return undefined
  }

  return actor.memberships.find((candidate) => candidate.organization_id === organizationId)
}

const isUnrestrictedActor = (actor: RequestActor) =>
  actor.type === 'service_client' || actor.global_role === 'admin'

export const deriveAccountState = ({
  globalRole,
  isActive,
  membershipCount,
}: {
  globalRole: 'none' | 'admin'
  isActive: boolean
  membershipCount: number
}): AccountState => {
  if (!isActive) {
    return 'suspended'
  }

  if (globalRole === 'admin' || membershipCount > 0) {
    return 'active'
  }

  return 'pending_membership'
}

export const requireAuthenticated = (
  actor: RequestActor | undefined
): { ok: true; actor: RequestActor } | { ok: false; error: AuthenticationGateError } => {
  if (!actor) {
    return {
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    }
  }

  return { ok: true, actor }
}

export const requireActiveAccount = (
  actor: RequestActor
): { ok: true } | { ok: false; error: AuthenticationGateError } => {
  if (actor.type === 'service_client' || actor.account_state === 'active') {
    return { ok: true }
  }

  if (actor.account_state === 'suspended') {
    return {
      ok: false,
      error: { type: 'AUTH_USER_DISABLED' },
    }
  }

  return {
    ok: false,
    error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}

export const requirePlatformAdmin = (
  actor: RequestActor
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (actor.type !== 'service_client' && actor.global_role === 'admin') {
    return { ok: true }
  }

  return {
    ok: false,
    error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}

export const requireOrganizationMember = (
  actor: RequestActor,
  organizationId: string
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (isUnrestrictedActor(actor)) {
    return { ok: true }
  }

  if (findMembership(actor, organizationId)) {
    return { ok: true }
  }

  return {
    ok: false,
    error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}

export const requireOrganizationManager = (
  actor: RequestActor,
  organizationId: string
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (isUnrestrictedActor(actor)) {
    return { ok: true }
  }

  const membership = findMembership(actor, organizationId)

  if (membership && roleAtLeast(membership.role, 'manager')) {
    return { ok: true }
  }

  return {
    ok: false,
    error: membership
      ? { type: 'AUTH_DASHBOARD_FORBIDDEN' }
      : { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}

export const requireOrganizationOwner = (
  actor: RequestActor,
  organizationId: string
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (isUnrestrictedActor(actor)) {
    return { ok: true }
  }

  const membership = findMembership(actor, organizationId)

  if (membership && roleAtLeast(membership.role, 'owner')) {
    return { ok: true }
  }

  return {
    ok: false,
    error: membership
      ? { type: 'AUTH_DASHBOARD_FORBIDDEN' }
      : { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}

export const accessibleOrganizationIds = (actor: RequestActor): string[] | undefined => {
  if (isUnrestrictedActor(actor)) {
    return undefined
  }

  if (actor.type === 'service_client') {
    return undefined
  }

  return actor.memberships.map((membership) => membership.organization_id)
}

export const requireDashboardWriteAccess = (
  actor: RequestActor,
  organizationId: string
): { ok: true } | { ok: false; error: AuthorizationError } => {
  return requireOrganizationManager(actor, organizationId)
}

export const requireDashboardReadAccess = (
  actor: RequestActor
): { ok: true; organizationIds?: string[] } | { ok: false; error: AuthorizationError } => {
  if (isUnrestrictedActor(actor)) {
    return { ok: true }
  }

  if (actor.type === 'service_client') {
    return { ok: true }
  }

  const managerOrganizationIds = actor.memberships
    .filter((membership) => roleAtLeast(membership.role, 'manager'))
    .map((membership) => membership.organization_id)

  if (managerOrganizationIds.length === 0) {
    return {
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    }
  }

  return {
    ok: true,
    organizationIds: managerOrganizationIds,
  }
}

export interface RecordingAccessResource {
  organization_id: string
  pedestrian_user_id: string | null
}

export const requireRecordingAccess = (
  actor: RequestActor,
  resource: RecordingAccessResource
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (isUnrestrictedActor(actor)) {
    return { ok: true }
  }

  if (actor.type === 'service_client') {
    return { ok: true }
  }

  const membership = findMembership(actor, resource.organization_id)

  if (!membership) {
    return {
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    }
  }

  if (roleAtLeast(membership.role, 'manager') || resource.pedestrian_user_id === actor.user_id) {
    return { ok: true }
  }

  return {
    ok: false,
    error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}
