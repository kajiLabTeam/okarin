import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryCompletionResponseSchema,
  trajectoryIdParamsSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCompleteGroundTruthUploadRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/ground-truth/complete',
    tags: ['Trajectories'],
    description: 'trajectory 単位の ground truth の登録完了を反映する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory 単位 ground truth 登録完了',
        content: {
          'application/json': {
            schema: trajectoryCompletionResponseSchema,
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
      'POST /api/trajectories/:trajectoryId/ground-truth/complete',
      'trajectory 単位 ground truth の登録完了を反映する'
    )
  })
}
