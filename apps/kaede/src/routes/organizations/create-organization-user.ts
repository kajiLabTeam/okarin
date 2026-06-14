import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  createOrganizationUserRequestSchema,
  organizationIdParamsSchema,
  organizationUserSchema,
} from '../../schemas/organizations.js'
import { createOrganizationUserForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerCreateOrganizationUserRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/users',
    tags: ['Organizations'],
    description: 'organization 内 user を作成する',
    request: {
      params: organizationIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: createOrganizationUserRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'organization user created',
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
        description: 'organization not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'user already exists',
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
    const payload = c.req.valid('json')
    const result = await createOrganizationUserForSession(
      getSessionTokenFromCookie(c),
      organizationId,
      payload
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
