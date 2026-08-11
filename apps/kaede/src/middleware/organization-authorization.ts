import type { Context, MiddlewareHandler } from 'hono'
import type { MembershipRole } from '../schemas/common.js'
import { evaluateMembershipGrant } from '../services/organization-authorization/authorization.js'
import { findMembershipGrantContext } from '../services/organization-authorization/index.js'
import type { RequestActorHonoEnv } from './request-actor-context.js'
import { getRequestActor, getRequestSessionId } from './request-actor-context.js'

const forbidden = (c: Context<RequestActorHonoEnv>, errorCode: string, details?: object) =>
  c.json(
    {
      error_code: errorCode,
      error_message:
        errorCode === 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED'
          ? 'organization membership reauthentication required'
          : errorCode === 'AUTH_DASHBOARD_FORBIDDEN'
            ? 'dashboard access forbidden'
            : 'organization access forbidden',
      ...(details ? { details } : {}),
    },
    403
  )

export interface OrganizationAuthorizationMiddlewareOptions {
  requiredRole?: MembershipRole
  now?: () => Date
}

export const organizationAuthorizationMiddleware = ({
  requiredRole = 'member',
  now = () => new Date(),
}: OrganizationAuthorizationMiddlewareOptions = {}): MiddlewareHandler<RequestActorHonoEnv> => {
  return async (c, next) => {
    const actor = getRequestActor(c)

    // Shared-token clients are authenticated independently and have no user Membership grant.
    if (actor?.type === 'service_client') {
      await next()
      return
    }

    const sessionId = getRequestSessionId(c)
    if (actor?.type !== 'user' || !sessionId) {
      return c.json({ error_code: 'AUTH_UNAUTHENTICATED', error_message: 'login required' }, 401)
    }

    const organizationId = c.req.param('organizationId')
    if (!organizationId) {
      return forbidden(c, 'AUTH_ORGANIZATION_FORBIDDEN')
    }
    const context = await findMembershipGrantContext(sessionId, actor.user_id, organizationId)
    const result = evaluateMembershipGrant(context, requiredRole, now())

    if (result.ok) {
      await next()
      return
    }
    if (result.type === 'organization_forbidden') {
      return forbidden(c, 'AUTH_ORGANIZATION_FORBIDDEN', { organization_id: organizationId })
    }
    if (result.type === 'role_forbidden') {
      return forbidden(c, 'AUTH_DASHBOARD_FORBIDDEN', {
        organization_id: organizationId,
        membership_id: result.membershipId,
        required_role: requiredRole,
      })
    }

    return forbidden(c, 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED', {
      organization_id: organizationId,
      membership_id: result.membershipId,
      reason: result.reason,
      allowed_auth_methods: result.allowedAuthMethods,
    })
  }
}
