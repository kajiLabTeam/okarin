import { OpenAPIHono } from '@hono/zod-openapi'
import { registerOrganizationCreationRequestAdminRoutes } from './organization-creation-requests.js'

export const platformRoutes = new OpenAPIHono()

registerOrganizationCreationRequestAdminRoutes(platformRoutes)
