import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationsResponseSchema } from '../../schemas/organizations.js'
import { listOrganizationsForSession } from '../../usecases/organizations.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerListOrganizationsRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['Organizations'],
    description: 'organization 一覧を取得する',
    responses: {
      200: {
        description: 'organizations',
        content: {
          'application/json': {
            schema: organizationsResponseSchema,
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
    },
  })

  app.openapi(route, async (c) => {
    const result = await listOrganizationsForSession(getSessionTokenFromCookie(c))

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
