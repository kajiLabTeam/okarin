import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCreateFloorRoute } from './create-floor.js'
import { registerGetFloorRoute } from './get-floor.js'

export const floorsRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerGetFloorRoute(floorsRoutes)
registerCreateFloorRoute(floorsRoutes)
