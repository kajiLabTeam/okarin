import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { authMeResponseSchema } from '../../schemas/auth.js'
import {
  globalSessionErrorResponseSchema,
  userAccountErrorResponseSchema,
} from '../../schemas/common.js'
import { getMe } from '../../usecases/auth/index.js'
import { getSessionTokenFromCookie } from './cookie.js'
import { toAuthErrorResponse } from './error.js'

export const registerMeRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/me',
    tags: ['Auth'],
    description: '現在の session に紐づく user を返す',
    responses: {
      200: {
        description: 'current user',
        content: {
          'application/json': {
            schema: authMeResponseSchema,
          },
        },
      },
      401: {
        description: 'login required',
        content: {
          'application/json': {
            schema: globalSessionErrorResponseSchema,
          },
        },
      },
      403: {
        description: 'user disabled',
        content: {
          'application/json': {
            schema: userAccountErrorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const result = await getMe(getSessionTokenFromCookie(c))

    if (!result.ok) {
      if (result.error.type === 'AUTH_USER_DISABLED') {
        const error = toAuthErrorResponse(result.error)
        return c.json(error.body, error.status)
      }

      const error = toAuthErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
