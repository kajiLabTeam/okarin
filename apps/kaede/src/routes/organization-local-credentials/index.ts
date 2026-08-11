import { OpenAPIHono } from '@hono/zod-openapi'
import { registerOrganizationLocalCredentialRoutes } from './management.js'

export const organizationLocalCredentialRoutes = new OpenAPIHono()

registerOrganizationLocalCredentialRoutes(organizationLocalCredentialRoutes)
