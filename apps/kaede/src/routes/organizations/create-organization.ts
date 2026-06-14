import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { createOrganizationRequestSchema, organizationSchema } from '../../schemas/organizations.js'
import { createOrganizationForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerCreateOrganizationRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Organizations'],
    description: 'organization を作成する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createOrganizationRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'organization created',
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
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await createOrganizationForSession(getSessionTokenFromCookie(c), payload)

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403)
    }

    return c.json(result.value, 201)
  })
}
