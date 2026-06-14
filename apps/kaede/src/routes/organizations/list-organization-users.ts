import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationIdParamsSchema,
  organizationUsersResponseSchema,
} from '../../schemas/organizations.js'
import { listOrganizationUsersForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerListOrganizationUsersRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/users',
    tags: ['Organizations'],
    description: 'organization 内 user 一覧を取得する',
    request: {
      params: organizationIdParamsSchema,
    },
    responses: {
      200: {
        description: 'organization users',
        content: {
          'application/json': {
            schema: organizationUsersResponseSchema,
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
        description: 'organization not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await listOrganizationUsersForSession(
      getSessionTokenFromCookie(c),
      organizationId
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })
}
