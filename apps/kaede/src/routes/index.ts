import { OpenAPIHono } from '@hono/zod-openapi'
import { nozomiRoutes } from './nozomi/index.js'
import { pedestriansRoutes } from './pedestrians/index.js'
import { recordingsRoutes } from './recordings/index.js'
import { trajectoriesRoutes } from './trajectories/index.js'

export const registerApiRoutes = (app: OpenAPIHono) => {
  const api = new OpenAPIHono()

  api.route('/nozomi', nozomiRoutes)
  api.route('/pedestrians', pedestriansRoutes)
  api.route('/recordings', recordingsRoutes)
  api.route('/trajectories', trajectoriesRoutes)

  app.route('/api', api)
}
