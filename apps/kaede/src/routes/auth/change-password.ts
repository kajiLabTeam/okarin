import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import {
  authOkResponseSchema,
  changePasswordUnauthorizedErrorResponseSchema,
  changePasswordRequestSchema,
  sessionForbiddenErrorResponseSchema,
} from '../../schemas/auth.js'
import { changePassword } from '../../usecases/auth/index.js'
import { getSessionTokenFromCookie } from './cookie.js'
import { toAuthErrorResponse } from './error.js'

export const registerChangePasswordRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/change-password',
    tags: ['Auth'],
    description: 'login 中 user が自分の password を変更する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: changePasswordRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'password changed',
        content: {
          'application/json': {
            schema: authOkResponseSchema,
          },
        },
      },
      401: {
        description: 'login required or invalid current password',
        content: {
          'application/json': {
            schema: changePasswordUnauthorizedErrorResponseSchema,
          },
        },
      },
      403: {
        description: 'user disabled or temporary password expired',
        content: {
          'application/json': {
            schema: sessionForbiddenErrorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await changePassword(getSessionTokenFromCookie(c), payload)

    if (!result.ok) {
      const error = toAuthErrorResponse(result.error)
      if (error.status === 401) {
        return c.json(error.body, 401)
      }
      return c.json(error.body, 403)
    }

    return c.json(result.value, 200)
  })
}
