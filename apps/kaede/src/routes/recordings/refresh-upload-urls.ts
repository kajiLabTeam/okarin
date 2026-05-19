import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
  refreshUploadUrlsResponseSchema,
} from '../../schemas/recordings.js'
import { refreshUploadUrls } from '../../usecases/refresh-upload-urls.js'

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
        description:
          '現在状態では upload URL を再発行できない、または対象 target が recording に対して不正',
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
    const result = await refreshUploadUrls(params, payload)

    if (!result.ok) {
      switch (result.error.type) {
        case 'RECORDING_NOT_FOUND':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'recording not found',
              details: {
                recording_id: result.error.recordingId,
              },
            },
            404
          )

        case 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'upload url refresh is not allowed in the current upload state',
              details: {
                recording_id: result.error.recordingId,
                upload_status: result.error.uploadStatus,
              },
            },
            409
          )

        case 'RECORDING_UPLOAD_TARGETS_INVALID':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'requested targets are not allowed for this recording',
              details: {
                recording_id: result.error.recordingId,
                invalid_targets: result.error.invalidTargets,
              },
            },
            409
          )

        default: {
          const exhaustiveCheck: never = result.error
          throw new Error(`unhandled refresh-upload-urls error: ${JSON.stringify(exhaustiveCheck)}`)
        }
      }
    }

    return c.json(result.value, 200)
  })
}
