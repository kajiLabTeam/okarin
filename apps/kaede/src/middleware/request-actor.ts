import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { timingSafeEqual } from 'node:crypto'
import { sessionCookieName } from '../routes/auth/cookie.js'
import { findValidSessionByToken } from '../services/auth/index.js'
import { findUserById, listUserOrganizationMemberships } from '../services/users/index.js'

export interface UserActorMembership {
  organization_id: string
  organization_name: string
  role: 'member' | 'manager'
}

export interface UserRequestActor {
  type: 'user'
  user_id: string
  email: string
  global_role: 'none' | 'admin'
  password_must_change: boolean
  memberships: UserActorMembership[]
}

export interface ServiceClientRequestActor {
  type: 'service_client'
  name: 'shared_token'
}

export type RequestActor = UserRequestActor | ServiceClientRequestActor

export interface RequestActorVariables {
  requestActor?: RequestActor
}

export interface RequestActorHonoEnv {
  Variables: RequestActorVariables
}

type RequestActorContext = Context<RequestActorHonoEnv>

const requestActorKey = 'requestActor' satisfies keyof RequestActorVariables

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
  const messages: Record<typeof errorCode, string> = {
    AUTH_PASSWORD_CHANGE_REQUIRED: 'password change required',
    AUTH_SESSION_EXPIRED: 'session expired',
    AUTH_SESSION_REVOKED: 'session revoked',
    AUTH_UNAUTHENTICATED: 'login required',
    AUTH_USER_DISABLED: 'user is disabled',
  }
  const status = errorCode === 'AUTH_UNAUTHENTICATED' ? 401 : 403

  return c.json(
    {
      error_code: errorCode,
      error_message: messages[errorCode],
    },
    status
  )
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

export const setRequestActor = (c: RequestActorContext, actor: RequestActor) => {
  c.set(requestActorKey, actor)
}

export const getRequestActor = (c: RequestActorContext): RequestActor | undefined => {
  return c.get(requestActorKey)
}

export const requireRequestActor = (c: RequestActorContext): RequestActor => {
  const actor = getRequestActor(c)

  if (!actor) {
    throw new Error('request actor is not set')
  }

  return actor
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

    if (user.password_must_change) {
      return authError(c, 'AUTH_PASSWORD_CHANGE_REQUIRED')
    }

    const memberships = await listUserOrganizationMemberships(user.id)

    setRequestActor(c, {
      type: 'user',
      user_id: user.id,
      email: user.email,
      global_role: user.global_role as 'none' | 'admin',
      password_must_change: user.password_must_change,
      memberships: memberships.map((membership) => ({
        organization_id: membership.organization_id,
        organization_name: membership.organization_name,
        role: membership.role as 'member' | 'manager',
      })),
    })

    await next()
  }
}
