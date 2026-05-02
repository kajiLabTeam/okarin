import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryStatusResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerGetTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{trajectoryId}',
    tags: ['Trajectories'],
    description: 'trajectory の解析状態と失敗情報を返す',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory status',
        content: {
          'application/json': {
            schema: trajectoryStatusResponseSchema,
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

    return notImplemented(c, 'GET /api/trajectories/:trajectoryId', 'trajectory 状態を取得する')
  })
}
