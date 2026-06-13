import { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { RequestActor } from '../middleware/request-actor-context.js'

type RegisterRoute<TEnv extends Env> = (app: OpenAPIHono<TEnv>) => void

interface CreateRouteTestAppOptions {
  actor?: RequestActor
}

export const createRouteTestApp = <TEnv extends Env = Env>(
  basePath: string,
  registerRoute: RegisterRoute<TEnv>,
  options: CreateRouteTestAppOptions = {}
) => {
  const app = new OpenAPIHono<TEnv>()

  app.onError((err, c) => {
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

  const actor = options.actor

  if (actor) {
    app.use('/api/*', async (c, next) => {
      const setVariable = c.set as unknown as (key: 'requestActor', value: RequestActor) => void
      setVariable('requestActor', actor)
      await next()
    })
  }

  const api = new OpenAPIHono<TEnv>()
  const resource = new OpenAPIHono<TEnv>()

  registerRoute(resource)
  api.route(basePath, resource)
  app.route('/api', api)

  return app
}
