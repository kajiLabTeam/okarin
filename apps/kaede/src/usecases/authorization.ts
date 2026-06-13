import type { RequestActor } from '../middleware/request-actor-context.js'

export type AuthorizationError =
  | { type: 'AUTH_DASHBOARD_FORBIDDEN' }
  | { type: 'AUTH_ORGANIZATION_FORBIDDEN' }

export const accessibleOrganizationIds = (actor: RequestActor): string[] | undefined => {
  if (actor.type === 'service_client' || actor.global_role === 'admin') {
    return undefined
  }

  return actor.memberships.map((membership) => membership.organization_id)
}

export const requireDashboardWriteAccess = (
  actor: RequestActor,
  organizationId: string
): { ok: true } | { ok: false; error: AuthorizationError } => {
  if (actor.type === 'service_client' || actor.global_role === 'admin') {
    return { ok: true }
  }

  const membership = actor.memberships.find(
    (candidate) => candidate.organization_id === organizationId
  )

  if (!membership) {
    return {
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    }
  }

  if (membership.role !== 'manager') {
    return {
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    }
  }

  return { ok: true }
}

export const requireDashboardReadAccess = (
  actor: RequestActor
): { ok: true; organizationIds?: string[] } | { ok: false; error: AuthorizationError } => {
  if (actor.type === 'service_client' || actor.global_role === 'admin') {
    return { ok: true }
  }

  const managerOrganizationIds = actor.memberships
    .filter((membership) => membership.role === 'manager')
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
  if (actor.type === 'service_client' || actor.global_role === 'admin') {
    return { ok: true }
  }

  const membership = actor.memberships.find(
    (candidate) => candidate.organization_id === resource.organization_id
  )

  if (!membership) {
    return {
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    }
  }

  if (membership.role === 'manager' || resource.pedestrian_user_id === actor.user_id) {
    return { ok: true }
  }

  return {
    ok: false,
    error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
  }
}
