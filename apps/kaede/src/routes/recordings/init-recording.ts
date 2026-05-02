import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
} from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerInitRecordingRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/init',
    tags: ['Recordings'],
    description: '新しい recording を作成し、初回アップロード用の URL を返す',
    request: {
      body: {
        content: {
          'application/json': {
            schema: initRecordingRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'recording created',
        content: {
          'application/json': {
            schema: initRecordingResponseSchema,
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
    c.req.valid('json')

    return notImplemented(c, 'POST /api/recordings/init', 'recording を作成する')
  })
}
