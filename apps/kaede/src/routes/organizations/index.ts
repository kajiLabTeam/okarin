import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreateOrganizationMembershipRoute } from './create-organization-membership.js'
import { registerCreateOrganizationUserRoute } from './create-organization-user.js'
import { registerCreateOrganizationRoute } from './create-organization.js'
import { registerListOrganizationUsersRoute } from './list-organization-users.js'
import { registerListOrganizationsRoute } from './list-organizations.js'

export const organizationsRoutes = new OpenAPIHono()

registerListOrganizationsRoute(organizationsRoutes)
registerCreateOrganizationRoute(organizationsRoutes)
registerListOrganizationUsersRoute(organizationsRoutes)
registerCreateOrganizationUserRoute(organizationsRoutes)
registerCreateOrganizationMembershipRoute(organizationsRoutes)
