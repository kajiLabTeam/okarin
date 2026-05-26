import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, nozomiPingResponseSchema } from '../../schemas/common.js'
import { pingNozomi } from '../../services/nozomi/index.js'

export const registerPingNozomiRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/ping',
    tags: ['Nozomi'],
    description: 'kaede から nozomi の debug ping endpoint を呼び出して疎通確認する',
    responses: {
      200: {
        description: 'nozomi ping ok',
        content: {
          'application/json': {
            schema: nozomiPingResponseSchema,
          },
        },
      },
      502: {
        description: 'nozomi ping failed',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    try {
      const result = await pingNozomi()
      return c.json(result, 200)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error'

      return c.json(
        {
          error_code: 'NOZOMI_PING_FAILED',
          error_message: 'failed to ping nozomi',
          details: {
            reason: errorMessage,
          },
        },
        502
      )
    }
  })
}
