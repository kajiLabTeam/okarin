import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  uploadUrlWithPathResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerIssueGroundTruthUploadUrlRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/ground-truth/upload-url',
    tags: ['Trajectories'],
    description: 'trajectory 単位の ground truth をアップロードするための URL を発行する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory 単位 ground truth アップロード URL 発行',
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
      'POST /api/trajectories/:trajectoryId/ground-truth/upload-url',
      'trajectory 単位 ground truth の upload URL を発行する'
    )
  })
}
