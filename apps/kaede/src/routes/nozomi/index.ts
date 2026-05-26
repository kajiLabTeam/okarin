import { OpenAPIHono } from '@hono/zod-openapi'
import { registerPingNozomiRoute } from './ping.js'

export const nozomiRoutes = new OpenAPIHono()

registerPingNozomiRoute(nozomiRoutes)
