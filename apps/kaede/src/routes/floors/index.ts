import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCreateFloorRoute } from './create-floor.js'
import { registerGetFloorRoute } from './get-floor.js'
import { registerListFloorsRoute } from './list-floors.js'

export const floorsRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerListFloorsRoute(floorsRoutes)
registerGetFloorRoute(floorsRoutes)
registerCreateFloorRoute(floorsRoutes)
