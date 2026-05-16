import { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'

type RegisterRoute = (app: OpenAPIHono) => void

export const createRouteTestApp = (basePath: string, registerRoute: RegisterRoute) => {
  const app = new OpenAPIHono()

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

  const api = new OpenAPIHono()
  const resource = new OpenAPIHono()

  registerRoute(resource)
  api.route(basePath, resource)
  app.route('/api', api)

  return app
}
