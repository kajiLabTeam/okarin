import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  createOrganizationMembershipRequestSchema,
  organizationIdParamsSchema,
  organizationUserSchema,
} from '../../schemas/organizations.js'
import { createOrUpdateOrganizationMembershipForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerCreateOrganizationMembershipRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/memberships',
    tags: ['Organizations'],
    description: 'organization membership を作成または更新する',
    request: {
      params: organizationIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: createOrganizationMembershipRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'organization membership created or updated',
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
    const { organizationId } = c.req.valid('param')
    const payload = c.req.valid('json')
    const result = await createOrUpdateOrganizationMembershipForSession(
      getSessionTokenFromCookie(c),
      organizationId,
      payload
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })
}
