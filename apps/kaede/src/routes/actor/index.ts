import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerListActorBuildingsRoute } from './list-buildings.js'
import { registerListActorFloorsRoute } from './list-floors.js'

export const actorRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerListActorBuildingsRoute(actorRoutes)
registerListActorFloorsRoute(actorRoutes)
