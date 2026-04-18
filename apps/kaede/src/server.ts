import { Hono } from 'hono'

import { registerApiRoutes } from './routes/index.js'

export const createApp = () => {
  const app = new Hono()

  app.get('/', (c) => {
    return c.json({
      service: 'kaede',
      role: 'mediator',
      status: 'ok',
    })
  })

  registerApiRoutes(app)

  return app
}
