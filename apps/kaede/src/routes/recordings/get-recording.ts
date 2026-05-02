import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import { recordingDetailResponseSchema, recordingIdParamsSchema } from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerGetRecordingRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{recordingId}',
    tags: ['Recordings'],
    description: 'recording の基本情報とアップロード状態を返す',
    request: {
      params: recordingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'recording detail',
        content: {
          'application/json': {
            schema: recordingDetailResponseSchema,
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

    return notImplemented(c, 'GET /api/recordings/:recordingId', 'recording 詳細を取得する')
  })
}
