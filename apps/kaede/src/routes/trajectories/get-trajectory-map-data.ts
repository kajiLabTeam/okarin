import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryMapDataQuerySchema,
  trajectoryMapDataResponseSchema,
} from '../../schemas/trajectories.js'
import { getTrajectoryMapData } from '../../usecases/trajectories/get-trajectory-map-data.js'
import { toGetTrajectoryMapDataErrorResponse } from './error.js'

export const registerGetTrajectoryMapDataRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{trajectoryId}/map-data',
    tags: ['Trajectories'],
    description: 'trajectory 単位の map data を取得する',
    request: {
      params: trajectoryIdParamsSchema,
      query: trajectoryMapDataQuerySchema,
    },
    responses: {
      200: {
        description: 'trajectory 地図表示用データ',
        content: {
          'application/json': {
            schema: trajectoryMapDataResponseSchema,
          },
        },
      },
      400: {
        description: 'unsupported data type',
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
        description: 'trajectory が存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'trajectory の現在状態では map data を取得できない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      422: {
        description: '解析結果CSVが地図表示用データとして不正',
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
    const query = c.req.valid('query')
    const actor = requireRequestActor(c as unknown as RequestActorContext)
    const result = await getTrajectoryMapData(actor, params, query)

    if (!result.ok) {
      const error = toGetTrajectoryMapDataErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
