import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { floorIdParamsSchema, floorSchema } from '../../schemas/floors.js'
import { getFloor } from '../../usecases/floors/get-floor.js'
import type { GetFloorResult } from '../../usecases/floors/get-floor.js'

type GetFloorError = Extract<GetFloorResult, { ok: false }>['error']

const toGetFloorErrorResponse = (error: GetFloorError) => {
  return {
    body: {
      error_code: error.type,
      error_message: 'floor not found',
      details: {
        floor_id: error.floorId,
      },
    },
    status: 404 as const,
  }
}

export const registerGetFloorRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/{floorId}',
    tags: ['Floors'],
    description: 'floor の基本情報を building 情報とあわせて返す',
    request: {
      params: floorIdParamsSchema,
    },
    responses: {
      200: {
        description: 'floor detail',
        content: {
          'application/json': {
            schema: floorSchema,
          },
        },
      },
      404: {
        description: 'floor not found',
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
    const result = await getFloor(actor, params)

    if (!result.ok) {
      const error = toGetFloorErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
