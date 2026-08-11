import { OpenAPIHono } from '@hono/zod-openapi'
import { registerAnalysisRunRoutes } from './analysis-runs.js'
import { registerCreateOrganizationBuildingFloorRoute } from './create-organization-building-floor.js'
import { registerCreateOrganizationBuildingRoute } from './create-organization-building.js'
import { registerCreateOrganizationMembershipRoute } from './create-organization-membership.js'
import { registerCreateOrganizationUserActivationLinkRoute } from './create-organization-user-activation-link.js'
import { registerCreateOrganizationUserRoute } from './create-organization-user.js'
import { registerCreateOrganizationRoute } from './create-organization.js'
import { registerCreateStayHeatmapRoute } from './create-stay-heatmap.js'
import { registerGetOrganizationUserRoute } from './get-organization-user.js'
import { registerGetOrganizationRoute } from './get-organization.js'
import { registerListOrganizationBuildingFloorsRoute } from './list-organization-building-floors.js'
import { registerListOrganizationBuildingsRoute } from './list-organization-buildings.js'
import { registerListOrganizationFloorsRoute } from './list-organization-floors.js'
import { registerListOrganizationRecordingsRoute } from './list-organization-recordings.js'
import { registerListOrganizationTrajectoriesRoute } from './list-organization-trajectories.js'
import { registerListOrganizationUsersRoute } from './list-organization-users.js'
import { registerListOrganizationsRoute } from './list-organizations.js'
import { registerOrganizationMemberProfileRoutes } from './member-profiles.js'
import { registerOrganizationOidcProviderRoutes } from './oidc-providers.js'

export const organizationsRoutes = new OpenAPIHono()

registerListOrganizationsRoute(organizationsRoutes)
registerCreateOrganizationRoute(organizationsRoutes)
registerGetOrganizationRoute(organizationsRoutes)
registerListOrganizationBuildingsRoute(organizationsRoutes)
registerCreateOrganizationBuildingRoute(organizationsRoutes)
registerCreateOrganizationBuildingFloorRoute(organizationsRoutes)
registerListOrganizationBuildingFloorsRoute(organizationsRoutes)
registerListOrganizationFloorsRoute(organizationsRoutes)
registerListOrganizationRecordingsRoute(organizationsRoutes)
registerListOrganizationTrajectoriesRoute(organizationsRoutes)
registerListOrganizationUsersRoute(organizationsRoutes)
registerGetOrganizationUserRoute(organizationsRoutes)
registerCreateOrganizationUserRoute(organizationsRoutes)
registerCreateOrganizationUserActivationLinkRoute(organizationsRoutes)
registerCreateOrganizationMembershipRoute(organizationsRoutes)
registerCreateStayHeatmapRoute(organizationsRoutes)
registerAnalysisRunRoutes(organizationsRoutes)
registerOrganizationMemberProfileRoutes(organizationsRoutes)
registerOrganizationOidcProviderRoutes(organizationsRoutes)
