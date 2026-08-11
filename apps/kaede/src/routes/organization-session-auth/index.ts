import { OpenAPIHono } from '@hono/zod-openapi'
import { registerOrganizationSessionLogoutRoute } from './logout.js'

export const organizationSessionAuthRoutes = new OpenAPIHono()

registerOrganizationSessionLogoutRoute(organizationSessionAuthRoutes)
