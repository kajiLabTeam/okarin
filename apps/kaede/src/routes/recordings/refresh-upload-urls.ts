import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
  refreshUploadUrlsResponseSchema,
} from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerRefreshUploadUrlsRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/refresh-upload-urls',
    tags: ['Recordings'],
    description: '指定したアップロード対象について署名付き URL を再発行する',
    request: {
      params: recordingIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: refreshUploadUrlsRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'upload urls refreshed',
        content: {
          'application/json': {
            schema: refreshUploadUrlsResponseSchema,
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
        description: '現在状態では upload URL を再発行できない',
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
    c.req.valid('json')

    return notImplemented(
      c,
      'POST /api/recordings/:recordingId/refresh-upload-urls',
      'recording の upload URL を再発行する'
    )
  })
}
