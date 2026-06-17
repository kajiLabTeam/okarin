import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  approveOrganizationCreationRequestRequestSchema,
  organizationCreationRequestIdParamsSchema,
  organizationCreationRequestSchema,
  organizationCreationRequestsResponseSchema,
  rejectOrganizationCreationRequestRequestSchema,
} from '../../schemas/organizations.js'
import {
  approveOrganizationCreationRequestForAdminSession,
  getOrganizationCreationRequestForAdminSession,
  listOrganizationCreationRequestsForAdminSession,
  rejectOrganizationCreationRequestForAdminSession,
} from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from '../organizations/error.js'

export const registerOrganizationCreationRequestAdminRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/organization-creation-requests',
    tags: ['Platform'],
    description: 'platform admin が organization 作成申請一覧を取得する',
    responses: {
      200: {
        description: 'organization creation requests',
        content: {
          'application/json': {
            schema: organizationCreationRequestsResponseSchema,
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

  const getRoute = createRoute({
    method: 'get',
    path: '/organization-creation-requests/{requestId}',
    tags: ['Platform'],
    description: 'platform admin が organization 作成申請詳細を取得する',
    request: {
      params: organizationCreationRequestIdParamsSchema,
    },
    responses: {
      200: {
        description: 'organization creation request',
        content: {
          'application/json': {
            schema: organizationCreationRequestSchema,
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
        description: 'not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  const approveRoute = createRoute({
    method: 'post',
    path: '/organization-creation-requests/{requestId}/approve',
    tags: ['Platform'],
    description: 'platform admin が organization 作成申請を承認する',
    request: {
      params: organizationCreationRequestIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: approveOrganizationCreationRequestRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'organization creation request approved',
        content: {
          'application/json': {
            schema: organizationCreationRequestSchema,
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
        description: 'not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'conflict',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  const rejectRoute = createRoute({
    method: 'post',
    path: '/organization-creation-requests/{requestId}/reject',
    tags: ['Platform'],
    description: 'platform admin が organization 作成申請を却下する',
    request: {
      params: organizationCreationRequestIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: rejectOrganizationCreationRequestRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'organization creation request rejected',
        content: {
          'application/json': {
            schema: organizationCreationRequestSchema,
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
        description: 'not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'conflict',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(listRoute, async (c) => {
    const result = await listOrganizationCreationRequestsForAdminSession(
      getSessionTokenFromCookie(c)
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403)
    }

    return c.json(result.value, 200)
  })

  app.openapi(getRoute, async (c) => {
    const { requestId } = c.req.valid('param')
    const result = await getOrganizationCreationRequestForAdminSession(
      getSessionTokenFromCookie(c),
      requestId
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })

  app.openapi(approveRoute, async (c) => {
    const { requestId } = c.req.valid('param')
    const payload = c.req.valid('json')
    const result = await approveOrganizationCreationRequestForAdminSession(
      getSessionTokenFromCookie(c),
      requestId,
      payload
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })

  app.openapi(rejectRoute, async (c) => {
    const { requestId } = c.req.valid('param')
    const payload = c.req.valid('json')
    const result = await rejectOrganizationCreationRequestForAdminSession(
      getSessionTokenFromCookie(c),
      requestId,
      payload
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
