import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  batchTrajectoryMapDataRequestSchema,
  batchTrajectoryMapDataResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerBatchTrajectoryMapDataRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/map-data:batch',
    tags: ['Trajectories'],
    description: '複数の trajectory ID を指定して map data をまとめて取得する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: batchTrajectoryMapDataRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: '複数 trajectory 地図表示用データ',
        content: {
          'application/json': {
            schema: batchTrajectoryMapDataResponseSchema,
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
    c.req.valid('json')

    return notImplemented(
      c,
      'POST /api/trajectories/map-data:batch',
      '複数 trajectory の map data を取得する'
    )
  })
}
