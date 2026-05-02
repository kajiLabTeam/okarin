import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import { completeUploadResponseSchema, recordingIdParamsSchema } from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCompleteUploadRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/complete-upload',
    tags: ['Recordings'],
    description: 'recording に紐づく raw データのアップロード完了を確定する',
    request: {
      params: recordingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'upload confirmed',
        content: {
          'application/json': {
            schema: completeUploadResponseSchema,
          },
        },
      },
      404: {
        description: 'recording が存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: '現在状態では upload 完了を確定できない',
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

    return notImplemented(
      c,
      'POST /api/recordings/:recordingId/complete-upload',
      'recording の raw upload 完了を反映する'
    )
  })
}
