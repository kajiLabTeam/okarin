import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'

import { registerApiRoutes } from './routes/index.js'

export const createApp = () => {
  const app = new OpenAPIHono()

  const healthRoute = createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        description: 'service health',
        content: {
          'application/json': {
            schema: z.object({
              service: z.literal('kaede'),
              role: z.literal('mediator'),
              status: z.literal('ok'),
            }),
          },
        },
      },
    },
  })

  app.openapi(healthRoute, (c) => {
    return c.json({
      service: 'kaede',
      role: 'mediator',
      status: 'ok',
    })
  })

  registerApiRoutes(app)

  app
    .doc('/specification', {
      openapi: '3.0.0',
      info: {
        title: 'kaede API',
        version: '0.1.0',
      },
    })
    .get(
      '/doc',
      Scalar({
        url: '/specification',
      })
    )

  return app
}
