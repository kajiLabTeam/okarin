import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import { paginationQuerySchema } from '../../schemas/pagination.js'
import { recordingsResponseSchema } from '../../schemas/recordings.js'
import { listOrganizationRecordingsForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerListOrganizationRecordingsRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/recordings',
    tags: ['Organizations'],
    description: 'organization 内 recording 一覧を取得する',
    request: {
      params: organizationIdParamsSchema,
      query: paginationQuerySchema,
    },
    responses: {
      200: {
        description: 'organization recordings',
        content: {
          'application/json': {
            schema: recordingsResponseSchema,
          },
        },
      },
      400: {
        description: 'invalid request parameter, pagination query, or cursor',
        content: {
          'application/json': {
            schema: errorResponseSchema,
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

  app.openapi(
    route,
    async (c) => {
      const { organizationId } = c.req.valid('param')
      const query = c.req.valid('query')
      const result = await listOrganizationRecordingsForSession(
        getSessionTokenFromCookie(c),
        organizationId,
        query
      )

      if (!result.ok) {
        if (result.error.type === 'PAGINATION_CURSOR_INVALID') {
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'pagination cursor is invalid',
            },
            400
          )
        }

        const error = toOrganizationErrorResponse(result.error)
        return c.json(error.body, error.status as 401 | 403 | 404)
      }

      return c.json(result.value, 200)
    },
    (result, c) => {
      if (!result.success && result.target === 'query') {
        return c.json(
          {
            error_code: 'PAGINATION_QUERY_INVALID',
            error_message: 'pagination query is invalid',
          },
          400
        )
      }

      if (!result.success && result.target === 'param') {
        return c.json(
          {
            error_code: 'REQUEST_PARAMS_INVALID',
            error_message: 'request parameters are invalid',
          },
          400
        )
      }
    }
  )
}
