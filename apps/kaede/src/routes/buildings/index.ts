import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCreateBuildingRoute } from './create-building.js'

export const buildingsRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerCreateBuildingRoute(buildingsRoutes)
