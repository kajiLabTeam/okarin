import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { activationCompleteRequestSchema, authOkResponseSchema } from '../../schemas/auth.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { completeActivation } from '../../usecases/auth/index.js'
import { toAuthErrorResponse } from './error.js'

export const registerActivationCompleteRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/activation/complete',
    tags: ['Auth'],
    description: 'activation token で password 初期設定を完了する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: activationCompleteRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'activation completed',
        content: {
          'application/json': {
            schema: authOkResponseSchema,
          },
        },
      },
      401: {
        description: 'activation token invalid',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      400: {
        description: 'invalid request body',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await completeActivation(payload)

    if (!result.ok) {
      const error = toAuthErrorResponse(result.error)
      return c.json(error.body, 401)
    }

    return c.json(result.value, 200)
  })
}
