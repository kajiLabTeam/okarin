import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import * as Sentry from '@sentry/node'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { getRuntimeConfig } from './config/runtime.js'
import { requestActorMiddleware } from './middleware/request-actor.js'
import { registerApiRoutes } from './routes/index.js'

export const createApp = () => {
  const app = new OpenAPIHono()
  const runtimeConfig = getRuntimeConfig()
  const deployRef = runtimeConfig.app.deployRef
  const revision = runtimeConfig.app.revision
  const deployedAt = runtimeConfig.app.deployedAt
  const corsAllowedOrigins = runtimeConfig.app.corsAllowedOrigins

  app.use(async (_c, next) => {
    Sentry.setTag('service', 'kaede')
    await next()
  })

  if (corsAllowedOrigins.length > 0) {
    app.use(
      '/api/*',
      cors({
        origin: corsAllowedOrigins,
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
      })
    )
  }

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

  app.use(
    '/api/*',
    requestActorMiddleware({
      exemptPaths: ['/api/auth', '/api/trajectories/callback'],
      sharedToken: runtimeConfig.app.apiSharedToken,
    })
  )

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
              deploy_ref: z.string(),
              revision: z.string(),
              deployed_at: z.string(),
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
      deploy_ref: deployRef,
      revision,
      deployed_at: deployedAt,
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

  const appEnv = runtimeConfig.app.env
  if (appEnv === 'local' || appEnv === 'staging') {
    app.get('/debug-sentry', () => {
      throw new Error(`test error for sentry from ${appEnv}`)
    })
  }

  return app
}
