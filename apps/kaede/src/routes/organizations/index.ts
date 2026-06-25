import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCreateOrganizationBuildingFloorRoute } from './create-organization-building-floor.js'
import { registerCreateOrganizationBuildingRoute } from './create-organization-building.js'
import { registerCreateOrganizationMembershipRoute } from './create-organization-membership.js'
import { registerCreateOrganizationUserRoute } from './create-organization-user.js'
import { registerCreateOrganizationRoute } from './create-organization.js'
import { registerGetOrganizationUserRoute } from './get-organization-user.js'
import { registerGetOrganizationRoute } from './get-organization.js'
import { registerListOrganizationBuildingsRoute } from './list-organization-buildings.js'
import { registerListOrganizationFloorsRoute } from './list-organization-floors.js'
import { registerListOrganizationRecordingsRoute } from './list-organization-recordings.js'
import { registerListOrganizationUsersRoute } from './list-organization-users.js'
import { registerListOrganizationsRoute } from './list-organizations.js'

export const organizationsRoutes = new OpenAPIHono()

registerListOrganizationsRoute(organizationsRoutes)
registerCreateOrganizationRoute(organizationsRoutes)
registerGetOrganizationRoute(organizationsRoutes)
registerListOrganizationBuildingsRoute(organizationsRoutes)
registerCreateOrganizationBuildingRoute(organizationsRoutes)
registerCreateOrganizationBuildingFloorRoute(organizationsRoutes)
registerListOrganizationFloorsRoute(organizationsRoutes)
registerListOrganizationRecordingsRoute(organizationsRoutes)
registerListOrganizationUsersRoute(organizationsRoutes)
registerGetOrganizationUserRoute(organizationsRoutes)
registerCreateOrganizationUserRoute(organizationsRoutes)
registerCreateOrganizationMembershipRoute(organizationsRoutes)
