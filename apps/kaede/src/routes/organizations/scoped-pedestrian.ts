import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import { pedestrianSchema } from '../../schemas/pedestrians.js'
import { getMyPedestrianForOrganization } from '../../usecases/pedestrians/get-my-pedestrian.js'
import { toGetMyPedestrianErrorResponse } from '../pedestrians/error.js'

export const registerOrganizationScopedPedestrianRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/pedestrians/me',
    tags: ['Organization Pedestrians'],
    description: '指定したOrganizationに属するログインUserのpedestrianを返す',
    request: { params: organizationIdParamsSchema },
    responses: {
      200: {
        description: 'linked pedestrian',
        content: { 'application/json': { schema: pedestrianSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'organization grant required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'resource not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await getMyPedestrianForOrganization(
      requireRequestActor(c as RequestActorContext),
      organizationId
    )
    if (!result.ok) {
      const error = toGetMyPedestrianErrorResponse(result.error)
      if (result.error.type === 'PEDESTRIAN_NOT_FOUND') {
        return c.json(
          { error_code: 'RESOURCE_NOT_FOUND', error_message: 'resource not found' },
          404
        )
      }
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
