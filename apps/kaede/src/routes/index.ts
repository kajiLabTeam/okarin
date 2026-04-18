import { Hono } from 'hono'

import { recordingsRoutes } from './recordings.js'
import { trajectoriesRoutes } from './trajectories.js'

export const registerApiRoutes = (app: Hono) => {
  const api = new Hono()

  api.route('/recordings', recordingsRoutes)
  api.route('/trajectories', trajectoriesRoutes)

  app.route('/api', api)
}
