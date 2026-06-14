import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { completeUploadResponseSchema, recordingIdParamsSchema } from '../../schemas/recordings.js'
import { completeUpload } from '../../usecases/recordings/complete-upload.js'
import { toCompleteUploadErrorResponse } from './error.js'

export const registerCompleteUploadRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
        description: '現在状態では upload 完了を確定できない、または必要 target が未アップロード',
        content: {
          'application/json': {
            schema: errorResponseSchema,
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
      500: {
        description: 'recording の内部データ不整合により upload 完了を確定できない',
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
    const result = await completeUpload(actor, params)

    if (!result.ok) {
      const error = toCompleteUploadErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
