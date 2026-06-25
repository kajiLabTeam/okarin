import { OpenAPIHono } from '@hono/zod-openapi'
import { actorRoutes } from './actor/index.js'
import { authRoutes } from './auth/index.js'
import { buildingsRoutes } from './buildings/index.js'
import { floorsRoutes } from './floors/index.js'
import { nozomiRoutes } from './nozomi/index.js'
import { organizationCreationRequestsRoutes } from './organization-creation-requests/index.js'
import { organizationsRoutes } from './organizations/index.js'
import { pedestriansRoutes } from './pedestrians/index.js'
import { platformRoutes } from './platform/index.js'
import { recordingsRoutes } from './recordings/index.js'
import { trajectoriesRoutes } from './trajectories/index.js'

export const registerApiRoutes = (app: OpenAPIHono) => {
  const api = new OpenAPIHono()

  api.route('/actor', actorRoutes)
  api.route('/auth', authRoutes)
  api.route('/buildings', buildingsRoutes)
  api.route('/floors', floorsRoutes)
  api.route('/nozomi', nozomiRoutes)
  api.route('/organization-creation-requests', organizationCreationRequestsRoutes)
  api.route('/organizations', organizationsRoutes)
  api.route('/pedestrians', pedestriansRoutes)
  api.route('/platform', platformRoutes)
  api.route('/recordings', recordingsRoutes)
  api.route('/trajectories', trajectoriesRoutes)

  app.route('/api', api)
}
