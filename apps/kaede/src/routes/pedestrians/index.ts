import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCreatePedestrianRoute } from './create-pedestrian.js'
import { registerGetMyPedestrianRoute } from './get-my-pedestrian.js'
import { registerListPedestriansRoute } from './list-pedestrians.js'

export const pedestriansRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerGetMyPedestrianRoute(pedestriansRoutes)
registerListPedestriansRoute(pedestriansRoutes)
registerCreatePedestrianRoute(pedestriansRoutes)
