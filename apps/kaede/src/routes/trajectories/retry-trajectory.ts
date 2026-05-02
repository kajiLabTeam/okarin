import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  retriedTrajectoryResponseSchema,
  trajectoryIdParamsSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerRetryTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/retry',
    tags: ['Trajectories'],
    description: '既存の constraint をそのまま使って trajectory を再解析する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory 再解析受付',
        content: {
          'application/json': {
            schema: retriedTrajectoryResponseSchema,
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
      'POST /api/trajectories/:trajectoryId/retry',
      '同じ constraint で再解析する'
    )
  })
}
