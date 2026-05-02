import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  uploadUrlWithPathResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerIssueManualResultUploadUrlRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/manual-result/upload-url',
    tags: ['Trajectories'],
    description: '手動生成した解析結果をアップロードするための URL を発行する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: '手動推定軌跡アップロード URL 発行',
        content: {
          'application/json': {
            schema: uploadUrlWithPathResponseSchema,
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
      'POST /api/trajectories/:trajectoryId/manual-result/upload-url',
      '手動生成結果の upload URL を発行する'
    )
  })
}
