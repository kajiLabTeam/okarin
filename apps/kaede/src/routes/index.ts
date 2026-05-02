import { OpenAPIHono } from '@hono/zod-openapi'
import { recordingsRoutes } from './recordings/index.js'
import { trajectoriesRoutes } from './trajectories/index.js'

export const registerApiRoutes = (app: OpenAPIHono) => {
  const api = new OpenAPIHono()

  api.route('/recordings', recordingsRoutes)
  api.route('/trajectories', trajectoriesRoutes)

  app.route('/api', api)
}
