import { OpenAPIHono } from '@hono/zod-openapi'
import { registerListPedestriansRoute } from './list-pedestrians.js'

export const pedestriansRoutes = new OpenAPIHono()

registerListPedestriansRoute(pedestriansRoutes)
