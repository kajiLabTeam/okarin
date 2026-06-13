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
