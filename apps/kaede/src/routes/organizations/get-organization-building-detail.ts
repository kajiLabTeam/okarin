import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import {
  buildingDetailResponseSchema,
  organizationBuildingIdParamsSchema,
} from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { getOrganizationBuildingDetailForSession } from '../../usecases/organizations/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'
import { toOrganizationErrorResponse } from './error.js'

export const registerGetOrganizationBuildingDetailRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/buildings/{buildingId}/detail',
    tags: ['Organizations'],
    description: 'organization 内 building の概要、floor 一覧、recording 件数を取得する',
    request: {
      params: organizationBuildingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'organization building detail',
        content: {
          'application/json': {
            schema: buildingDetailResponseSchema,
          },
        },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'organization or building not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { buildingId, organizationId } = c.req.valid('param')
    const result = await getOrganizationBuildingDetailForSession(
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
