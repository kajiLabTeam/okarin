import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryResultResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerGetTrajectoryResultRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{trajectoryId}/result',
    tags: ['Trajectories'],
    description: 'trajectory の解析結果を取得する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory 結果取得 URL',
        content: {
          'application/json': {
            schema: trajectoryResultResponseSchema,
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
        description: 'trajectory の現在状態では結果を取得できない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
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

    return notImplemented(
      c,
      'GET /api/trajectories/:trajectoryId/result',
      'trajectory の解析結果を取得する'
    )
  })
}
