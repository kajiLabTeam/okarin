import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema, organizationSchema } from '../../schemas/organizations.js'
import { getOrganizationForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerGetOrganizationRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}',
    tags: ['Organizations'],
    description: 'organization を取得する',
    request: {
      params: organizationIdParamsSchema,
    },
    responses: {
      200: {
        description: 'organization',
        content: {
          'application/json': {
            schema: organizationSchema,
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
    const result = await getOrganizationForSession(getSessionTokenFromCookie(c), organizationId)

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })
}
