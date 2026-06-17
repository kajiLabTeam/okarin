import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import { authUserResponseSchema, loginRequestSchema } from '../../schemas/auth.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { login } from '../../usecases/auth/index.js'
import { setSessionCookie } from './cookie.js'
import { toAuthErrorResponse } from './error.js'

export const registerLoginRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    description: 'email と password で login し session cookie を発行する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: loginRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'login succeeded',
        content: {
          'application/json': {
            schema: authUserResponseSchema,
          },
        },
      },
      401: {
        description: 'invalid credentials',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      403: {
        description: 'user disabled or temporary password expired',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    if (!getOidcRuntimeConfig().passwordLoginEnabled) {
      return c.json(
        {
          error_code: 'AUTH_PASSWORD_LOGIN_DISABLED',
          error_message: 'password login is disabled',
        },
        403
      )
    }

    const payload = c.req.valid('json')
    const result = await login(payload)

    if (!result.ok) {
      const error = toAuthErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    setSessionCookie(c, result.value.sessionToken)

    return c.json(
      {
        user: result.value.user,
      },
      200
    )
  })
}
