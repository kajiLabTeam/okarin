import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { completeUploadResponseSchema, recordingIdParamsSchema } from '../../schemas/recordings.js'
import { completeUpload } from '../../usecases/complete-upload.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

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
      switch (result.error.type) {
        case 'AUTH_DASHBOARD_FORBIDDEN':
        case 'AUTH_ORGANIZATION_FORBIDDEN': {
          const error = toAuthorizationErrorResponse(result.error)
          return c.json(error.body, error.status)
        }

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

        case 'UPLOAD_TARGETS_MISSING':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'some upload targets are missing',
              details: {
                recording_id: result.error.recordingId,
                missing_targets: result.error.missingTargets,
              },
            },
            409
          )

        case 'RECORDING_UPLOAD_FINALIZED':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'recording is already in a terminal upload state',
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
              error_message: 'recording upload_targets contains invalid values',
              details: {
                recording_id: result.error.recordingId,
                invalid_targets: result.error.invalidTargets,
              },
            },
            500
          )

        default: {
          const exhaustiveCheck: never = result.error
          throw new Error(`unhandled complete-upload error: ${JSON.stringify(exhaustiveCheck)}`)
        }
      }
    }

    return c.json(result.value, 200)
  })
}
