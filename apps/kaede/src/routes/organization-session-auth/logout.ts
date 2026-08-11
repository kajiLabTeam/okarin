import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationSessionLogoutParamsSchema,
  organizationSessionLogoutResponseSchema,
} from '../../schemas/organization-session-auth.js'
import { logoutFromOrganization } from '../../usecases/organization-session-auth/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'

const logoutError = (type: string) => {
  if (type === 'AUTH_ORGANIZATION_FORBIDDEN') {
    return {
      status: 403 as const,
      body: { error_code: type, error_message: 'organization access forbidden' },
    }
  }
  return {
    status: 401 as const,
    body: { error_code: type, error_message: 'valid session required' },
  }
}

export const registerOrganizationSessionLogoutRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/auth/logout',
    tags: ['Organization Auth'],
    description:
      '現在Sessionの対象Organization Membership Grantだけをrevokeし、Sessionと他Organization Grantは維持する',
    request: { params: organizationSessionLogoutParamsSchema },
    responses: {
      200: {
        description: 'organization logout succeeded',
        content: { 'application/json': { schema: organizationSessionLogoutResponseSchema } },
      },
      401: {
        description: 'valid session required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'organization membership required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const result = await logoutFromOrganization(
      c.req.valid('param').organizationId,
      getSessionTokenFromCookie(c),
      {
        requestId: c.req.header('x-request-id'),
        userAgent: c.req.header('user-agent'),
      }
    )
    if (!result.ok) {
      const error = logoutError(result.error.type)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
