import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import { trajectoryIdParamsSchema } from '../../schemas/trajectories.js'
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
