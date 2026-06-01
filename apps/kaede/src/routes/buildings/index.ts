import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreateBuildingRoute } from './create-building.js'

export const buildingsRoutes = new OpenAPIHono()

registerCreateBuildingRoute(buildingsRoutes)
