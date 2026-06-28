import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationUserActivationLinkResponseSchema,
  organizationUserParamsSchema,
} from '../../schemas/organizations.js'
import { createOrganizationUserActivationLinkForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerCreateOrganizationUserActivationLinkRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/users/{userId}/activation-link',
    tags: ['Organizations'],
    description: 'organization user の初期設定 URL を発行する',
    request: {
      params: organizationUserParamsSchema,
    },
    responses: {
      200: {
        description: 'organization user activation link',
        content: {
          'application/json': {
            schema: organizationUserActivationLinkResponseSchema,
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
      409: {
        description: 'organization user is not pending activation',
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
    const result = await createOrganizationUserActivationLinkForSession(
      getSessionTokenFromCookie(c),
      organizationId,
      userId
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
