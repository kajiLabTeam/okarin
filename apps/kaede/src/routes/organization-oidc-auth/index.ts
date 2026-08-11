import { OpenAPIHono } from '@hono/zod-openapi'
import { registerOrganizationOidcStartRoute } from './start.js'

export const organizationOidcAuthRoutes = new OpenAPIHono()

registerOrganizationOidcStartRoute(organizationOidcAuthRoutes)
