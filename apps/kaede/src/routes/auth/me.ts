import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { authUserResponseSchema } from '../../schemas/auth.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { getMe } from '../../usecases/auth.js'
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
            schema: authUserResponseSchema,
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
        description: 'user disabled',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const result = await getMe(getSessionTokenFromCookie(c))

    if (!result.ok) {
      const error = toAuthErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
