import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreatePedestrianRoute } from './create-pedestrian.js'
import { registerListPedestriansRoute } from './list-pedestrians.js'

export const pedestriansRoutes = new OpenAPIHono()

registerListPedestriansRoute(pedestriansRoutes)
registerCreatePedestrianRoute(pedestriansRoutes)
