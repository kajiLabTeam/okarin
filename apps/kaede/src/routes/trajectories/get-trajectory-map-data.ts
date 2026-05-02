import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryMapDataQuerySchema,
  trajectoryMapDataResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

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
      501: {
        description: 'not implemented',
        content: {
          'application/json': {
            schema: notImplementedResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, (c) => {
    c.req.valid('param')
    c.req.valid('query')

    return notImplemented(
      c,
      'GET /api/trajectories/:trajectoryId/map-data',
      'trajectory の map data を取得する'
    )
  })
}
