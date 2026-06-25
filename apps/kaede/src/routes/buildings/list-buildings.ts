import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { buildingsListResponseSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { listBuildings } from '../../usecases/buildings/list-buildings.js'
import type { ListBuildingsResult } from '../../usecases/buildings/list-buildings.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type ListBuildingsError = Extract<ListBuildingsResult, { ok: false }>['error']

const toListBuildingsErrorResponse = (error: ListBuildingsError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
  }
}

export const registerListBuildingsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['Buildings'],
    description: 'building 一覧を返す',
    responses: {
      200: {
        description: 'building list',
        content: {
          'application/json': {
            schema: buildingsListResponseSchema,
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
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c)
    const result = await listBuildings(actor)

    if (!result.ok) {
      const error = toListBuildingsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
