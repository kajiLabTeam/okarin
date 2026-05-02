import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  recordingGroundTruthRequestSchema,
  recordingGroundTruthUploadUrlResponseSchema,
  recordingIdParamsSchema,
} from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerIssueGroundTruthUploadUrlRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/ground-truth/upload-url',
    tags: ['Recordings'],
    description: 'recording 単位の ground truth raw をアップロードするための URL を発行する',
    request: {
      params: recordingIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: recordingGroundTruthRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'ground truth raw アップロード URL 発行',
        content: {
          'application/json': {
            schema: recordingGroundTruthUploadUrlResponseSchema,
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
      'POST /api/recordings/:recordingId/ground-truth/upload-url',
      'ground truth raw の upload URL を発行する'
    )
  })
}
