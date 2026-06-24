import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationUserParamsSchema,
  organizationUserSchema,
} from '../../schemas/organizations.js'
import { getOrganizationUserForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerGetOrganizationUserRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/users/{userId}',
    tags: ['Organizations'],
    description: 'organization 内 user 詳細を取得する',
    request: {
      params: organizationUserParamsSchema,
    },
    responses: {
      200: {
        description: 'organization user',
        content: {
          'application/json': {
            schema: organizationUserSchema,
          },
        },
      },
      401: {
        description: 'login required',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      403: {
        description: 'permission denied',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'organization or user not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { organizationId, userId } = c.req.valid('param')
    const result = await getOrganizationUserForSession(
      getSessionTokenFromCookie(c),
      organizationId,
      userId
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })
}
