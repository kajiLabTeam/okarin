import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { buildingIdParamsSchema, buildingSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { getBuilding } from '../../usecases/buildings/get-building.js'
import type { GetBuildingResult } from '../../usecases/buildings/get-building.js'

type GetBuildingError = Extract<GetBuildingResult, { ok: false }>['error']

const toGetBuildingErrorResponse = (error: GetBuildingError) => {
  return {
    body: {
      error_code: error.type,
      error_message: 'building not found',
      details: {
        building_id: error.buildingId,
      },
    },
    status: 404 as const,
  }
}

export const registerGetBuildingRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/{buildingId}',
    tags: ['Buildings'],
    description: 'building の基本情報を返す',
    request: {
      params: buildingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'building detail',
        content: {
          'application/json': {
            schema: buildingSchema,
          },
        },
      },
      404: {
        description: 'building not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const actor = requireRequestActor(c)
    const result = await getBuilding(actor, params)

    if (!result.ok) {
      const error = toGetBuildingErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
