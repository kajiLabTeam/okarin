import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import * as Sentry from '@sentry/node'
import { HTTPException } from 'hono/http-exception'
import { registerApiRoutes } from './routes/index.js'

export const createApp = () => {
  const app = new OpenAPIHono()

  app.use(async (_c, next) => {
    Sentry.setTag('service', 'kaede')
    await next()
  })

  app.onError((err, c) => {
    Sentry.captureException(err)

    if (err instanceof HTTPException) {
      return err.getResponse()
    }

    return c.json(
      {
        error: 'Internal server error',
      },
      500
    )
  })

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

  const appEnv = process.env.APP_ENV ?? 'local'
  if (appEnv === 'local' || appEnv === 'staging') {
    app.get('/debug-sentry', () => {
      throw new Error(`test error for sentry from ${appEnv}`)
    })
  }

  return app
}
