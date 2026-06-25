import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { organizationBuildingIdParamsSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { floorsListResponseSchema } from '../../schemas/floors.js'
import { listOrganizationBuildingFloorsForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerListOrganizationBuildingFloorsRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/buildings/{buildingId}/floors',
    tags: ['Organizations'],
    description: 'organization 内 building に紐づく floor 一覧を取得する',
    request: {
      params: organizationBuildingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'organization building floors',
        content: {
          'application/json': {
            schema: floorsListResponseSchema,
          },
        },
      },
      401: {
        description: 'login required',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      403: {
        description: 'permission denied',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'organization or building not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { buildingId, organizationId } = c.req.valid('param')
    const result = await listOrganizationBuildingFloorsForSession(
      getSessionTokenFromCookie(c),
      organizationId,
      buildingId
    )

    if (!result.ok) {
      const error = toOrganizationErrorResponse(result.error)
      return c.json(error.body, error.status as 401 | 403 | 404)
    }

    return c.json(result.value, 200)
  })
}
