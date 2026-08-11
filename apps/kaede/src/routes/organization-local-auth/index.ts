import { OpenAPIHono } from '@hono/zod-openapi'
import { registerLocalOrganizationLoginRoute } from './local-login.js'

export const organizationLocalAuthRoutes = new OpenAPIHono()

registerLocalOrganizationLoginRoute(organizationLocalAuthRoutes)
