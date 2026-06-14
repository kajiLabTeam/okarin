import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
  refreshUploadUrlsResponseSchema,
} from '../../schemas/recordings.js'
import { refreshUploadUrls } from '../../usecases/recordings/refresh-upload-urls.js'
import { toRefreshUploadUrlsErrorResponse } from './error.js'

export const registerRefreshUploadUrlsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
        description:
          '現在状態では upload URL を再発行できない、または対象 target が recording に対して不正',
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
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c)
    const result = await refreshUploadUrls(actor, params, payload)

    if (!result.ok) {
      const error = toRefreshUploadUrlsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
