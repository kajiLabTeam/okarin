import { OpenAPIHono } from '@hono/zod-openapi'
import { registerListFloorsRoute } from './list-floors.js'

export const floorsRoutes = new OpenAPIHono()

registerListFloorsRoute(floorsRoutes)
