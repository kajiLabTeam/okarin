import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { timingSafeEqual } from 'node:crypto'
import { sessionCookieName } from '../routes/auth/cookie.js'
import { toAuthErrorResponse } from '../schemas/common.js'
import { findValidSessionByToken } from '../services/auth/index.js'
import { findUserById, listUserOrganizationMemberships } from '../services/users/index.js'
import { deriveAccountState } from '../usecases/authorization.js'
import type { RequestActorHonoEnv } from './request-actor-context.js'
import { setRequestActor } from './request-actor-context.js'
export type {
  RequestActor,
  RequestActorHonoEnv,
  RequestActorVariables,
  ServiceClientRequestActor,
  UserActorMembership,
  UserRequestActor,
} from './request-actor-context.js'
export { getRequestActor, requireRequestActor, setRequestActor } from './request-actor-context.js'

type RequestActorContext = Context<RequestActorHonoEnv>

const isEqualToken = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

const extractBearerToken = (authorization: string | undefined) => {
  const match = authorization?.trim().match(/^bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

const hasBearerAuthorization = (authorization: string | undefined) => {
  return /^bearer\s+/i.test(authorization?.trim() ?? '')
}

const isExemptPath = (path: string, exemptPaths: string[]) => {
  return exemptPaths.some((exemptPath) => path === exemptPath || path.startsWith(`${exemptPath}/`))
}

const authError = (
  c: RequestActorContext,
  errorCode:
    | 'AUTH_PASSWORD_CHANGE_REQUIRED'
    | 'AUTH_SESSION_EXPIRED'
    | 'AUTH_SESSION_REVOKED'
    | 'AUTH_UNAUTHENTICATED'
    | 'AUTH_USER_DISABLED'
) => {
  const error = toAuthErrorResponse(errorCode)

  return c.json(error.body, error.status)
}

const sharedTokenAuthError = (c: RequestActorContext) => {
  return c.json(
    {
      error_code: 'UNAUTHORIZED',
      error_message: 'invalid or missing API token',
    },
    401
  )
}

export interface RequestActorMiddlewareOptions {
  exemptPaths?: string[]
  sharedToken?: string
}

export const requestActorMiddleware = ({
  exemptPaths = [],
  sharedToken,
}: RequestActorMiddlewareOptions): MiddlewareHandler<RequestActorHonoEnv> => {
  return async (c, next) => {
    if (!sharedToken || isExemptPath(c.req.path, exemptPaths)) {
      await next()
      return
    }

    const authorization = c.req.header('authorization')

    if (hasBearerAuthorization(authorization)) {
      const actualToken = extractBearerToken(authorization)

      if (!actualToken || !isEqualToken(actualToken, sharedToken)) {
        return sharedTokenAuthError(c)
      }

      setRequestActor(c, {
        type: 'service_client',
        name: 'shared_token',
      })
      await next()
      return
    }

    const sessionToken = getCookie(c, sessionCookieName)

    if (!sessionToken) {
      return authError(c, 'AUTH_UNAUTHENTICATED')
    }

    const sessionResult = await findValidSessionByToken(sessionToken)

    if (!sessionResult.ok) {
      switch (sessionResult.error) {
        case 'SESSION_EXPIRED':
          return authError(c, 'AUTH_SESSION_EXPIRED')
        case 'SESSION_REVOKED':
          return authError(c, 'AUTH_SESSION_REVOKED')
        case 'SESSION_NOT_FOUND':
          return authError(c, 'AUTH_UNAUTHENTICATED')
      }
    }

    const user = await findUserById(sessionResult.session.user_id)

    if (!user) {
      return authError(c, 'AUTH_UNAUTHENTICATED')
    }

    if (!user.is_active) {
      return authError(c, 'AUTH_USER_DISABLED')
    }

    if (sessionResult.session.auth_method === 'password' && user.password_must_change) {
      return authError(c, 'AUTH_PASSWORD_CHANGE_REQUIRED')
    }

    const memberships = await listUserOrganizationMemberships(user.id)

    setRequestActor(c, {
      type: 'user',
      user_id: user.id,
      email: user.email,
      global_role: user.global_role as 'none' | 'admin',
      account_state: deriveAccountState({
        globalRole: user.global_role as 'none' | 'admin',
        isActive: user.is_active,
        membershipCount: memberships.length,
      }),
      password_must_change: user.password_must_change,
      memberships: memberships.map((membership) => ({
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        role: membership.role as 'member' | 'manager' | 'owner',
      })),
    })

    await next()
  }
}
