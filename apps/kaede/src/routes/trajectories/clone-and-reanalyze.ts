import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  cloneAndReanalyzeRequestSchema,
  retriedTrajectoryResponseSchema,
  trajectoryIdParamsSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCloneAndReanalyzeRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/clone-and-reanalyze',
    tags: ['Trajectories'],
    description: '既存 trajectory を複製し、新しい constraint で再解析する',
    request: {
      params: trajectoryIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: cloneAndReanalyzeRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'trajectory 複製再解析受付',
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
    c.req.valid('json')

    return notImplemented(
      c,
      'POST /api/trajectories/:trajectoryId/clone-and-reanalyze',
      'constraint を変えて再解析する'
    )
  })
}
