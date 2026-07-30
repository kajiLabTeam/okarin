import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  recordingRawDownloadResponseSchema,
} from '../../schemas/recordings.js'
import { getRecordingRaw } from '../../usecases/recordings/get-recording-raw.js'
import { toGetRecordingRawErrorResponse } from './error.js'

export const registerGetRecordingRawRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/{recordingId}/raw',
    tags: ['Recordings'],
    description: 'recording の raw データを取得するための署名付き URL を返す',
    request: {
      params: recordingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'recording raw データ取得 URL',
        content: {
          'application/json': {
            schema: recordingRawDownloadResponseSchema,
          },
        },
      },
      403: {
        description: 'permission denied',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'recording not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'ダウンロード可能な recording raw データが存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const actor = requireRequestActor(c)
    const result = await getRecordingRaw(actor, params)

    if (!result.ok) {
      const error = toGetRecordingRawErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
