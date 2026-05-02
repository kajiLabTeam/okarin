import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  recordingTrajectoriesResponseSchema,
} from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerListRecordingTrajectoriesRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{recordingId}/trajectories',
    tags: ['Recordings'],
    description: 'recording に紐づく trajectory の一覧を返す',
    request: {
      params: recordingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'recording trajectories',
        content: {
          'application/json': {
            schema: recordingTrajectoriesResponseSchema,
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
      'GET /api/recordings/:recordingId/trajectories',
      'recording 配下の trajectory 一覧を取得する'
    )
  })
}
