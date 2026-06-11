import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreateOrganizationRoute } from './create-organization.js'
import { registerListOrganizationsRoute } from './list-organizations.js'

export const organizationsRoutes = new OpenAPIHono()

registerListOrganizationsRoute(organizationsRoutes)
registerCreateOrganizationRoute(organizationsRoutes)
