import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import {
  activationVerifyRequestSchema,
  activationVerifyResponseSchema,
} from '../../schemas/auth.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { verifyActivationToken } from '../../usecases/auth/index.js'

export const registerActivationVerifyRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/activation/verify',
    tags: ['Auth'],
    description: 'activation token の有効性を検証する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: activationVerifyRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'activation token verification result',
        content: {
          'application/json': {
            schema: activationVerifyResponseSchema,
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
    const result = await verifyActivationToken(payload)

    return c.json(result.value, 200)
  })
}
