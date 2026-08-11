import { OpenAPIHono } from '@hono/zod-openapi'
import { registerOrganizationAuthMethodsRoute } from './methods.js'

export const organizationAuthMethodsRoutes = new OpenAPIHono()

registerOrganizationAuthMethodsRoute(organizationAuthMethodsRoutes)
