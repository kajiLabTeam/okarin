import { OpenAPIHono } from '@hono/zod-openapi'
import { registerPublicOrganizationInviteRoutes } from './public.js'

export const organizationInvitesRoutes = new OpenAPIHono()
registerPublicOrganizationInviteRoutes(organizationInvitesRoutes)
