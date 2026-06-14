import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
} from '../../schemas/recordings.js'
import { initRecording } from '../../usecases/recordings/init-recording.js'
import { toInitRecordingErrorResponse } from './error.js'

export const registerInitRecordingRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
      404: {
        description: 'pedestrian or floor not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'pedestrian と floor の organization が一致しない',
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
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c)
    const result = await initRecording(actor, payload)

    if (result.ok) {
      return c.json(result.value, 201)
    }

    const error = toInitRecordingErrorResponse(result.error)
    return c.json(error.body, error.status)
  })
}
