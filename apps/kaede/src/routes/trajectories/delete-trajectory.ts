import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import { trajectoryIdParamsSchema } from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerDeleteTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'delete',
    path: '/{trajectoryId}',
    tags: ['Trajectories'],
    description: '指定した trajectory を論理削除する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      204: {
        description: 'trajectory 削除完了',
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

    return notImplemented(c, 'DELETE /api/trajectories/:trajectoryId', 'trajectory を削除する')
  })
}
