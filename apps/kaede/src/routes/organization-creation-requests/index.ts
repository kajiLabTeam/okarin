import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  createOrganizationCreationRequestRequestSchema,
  organizationCreationRequestSchema,
  organizationCreationRequestsResponseSchema,
} from '../../schemas/organizations.js'
import {
  createOrganizationCreationRequestForSession,
  listMyOrganizationCreationRequestsForSession,
} from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from '../organizations/error.js'

export const organizationCreationRequestsRoutes = new OpenAPIHono()

const createRequestRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Organization Creation Requests'],
  description: 'organization 作成申請を作成する',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createOrganizationCreationRequestRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'organization creation request created',
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

const listMyRequestsRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Organization Creation Requests'],
  description: '自分の organization 作成申請一覧を取得する',
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

organizationCreationRequestsRoutes.openapi(createRequestRoute, async (c) => {
  const payload = c.req.valid('json')
  const result = await createOrganizationCreationRequestForSession(
    getSessionTokenFromCookie(c),
    payload
  )

  if (!result.ok) {
    const error = toOrganizationErrorResponse(result.error)
    return c.json(error.body, error.status as 401 | 403 | 409)
  }

  return c.json(result.value, 201)
})

organizationCreationRequestsRoutes.openapi(listMyRequestsRoute, async (c) => {
  const result = await listMyOrganizationCreationRequestsForSession(getSessionTokenFromCookie(c))

  if (!result.ok) {
    const error = toOrganizationErrorResponse(result.error)
    return c.json(error.body, error.status as 401 | 403)
  }

  return c.json(result.value, 200)
})
