import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreateFloorRoute } from './create-floor.js'
import { registerListFloorsRoute } from './list-floors.js'

export const floorsRoutes = new OpenAPIHono()

registerListFloorsRoute(floorsRoutes)
registerCreateFloorRoute(floorsRoutes)
