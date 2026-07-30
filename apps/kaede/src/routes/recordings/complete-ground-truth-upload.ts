import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  recordingGroundTruthCompleteResponseSchema,
  recordingGroundTruthRequestSchema,
  recordingIdParamsSchema,
} from '../../schemas/recordings.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCompleteGroundTruthUploadRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/ground-truth/complete',
    tags: ['Recordings'],
    description: 'recording 単位の ground truth raw の登録完了を反映する',
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
        description: 'ground truth raw 登録完了',
        content: {
          'application/json': {
            schema: recordingGroundTruthCompleteResponseSchema,
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
      'POST /api/recordings/:recordingId/ground-truth/complete',
      'ground truth raw の登録完了を反映する'
    )
  })
}
