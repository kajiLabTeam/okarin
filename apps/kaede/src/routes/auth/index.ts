import { OpenAPIHono } from '@hono/zod-openapi'
import { registerChangePasswordRoute } from './change-password.js'
import { registerLoginRoute } from './login.js'
import { registerLogoutRoute } from './logout.js'
import { registerMeRoute } from './me.js'

export const authRoutes = new OpenAPIHono()

registerLoginRoute(authRoutes)
registerLogoutRoute(authRoutes)
registerMeRoute(authRoutes)
registerChangePasswordRoute(authRoutes)
