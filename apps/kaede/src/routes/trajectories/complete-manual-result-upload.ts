import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryCompletionResponseSchema,
  trajectoryIdParamsSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCompleteManualResultUploadRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/manual-result/complete',
    tags: ['Trajectories'],
    description: '手動生成した解析結果の登録完了を反映する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: '手動推定軌跡登録完了',
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
      'POST /api/trajectories/:trajectoryId/manual-result/complete',
      '手動生成結果の登録完了を反映する'
    )
  })
}
