import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCreateBuildingRoute } from './create-building.js'
import { registerGetBuildingRoute } from './get-building.js'
import { registerListBuildingsRoute } from './list-buildings.js'

export const buildingsRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerListBuildingsRoute(buildingsRoutes)
registerGetBuildingRoute(buildingsRoutes)
registerCreateBuildingRoute(buildingsRoutes)
