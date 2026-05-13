import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
} from '../../schemas/recordings.js'
import {
  FloorNotFoundError,
  initRecording,
  PedestrianNotFoundError,
} from '../../usecases/init-recording.js'

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
      404: {
        description: 'pedestrian or floor not found',
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

    try {
      const response = await initRecording(payload)
      return c.json(response, 201)
    } catch (error) {
      if (error instanceof PedestrianNotFoundError) {
        return c.json(
          {
            error_code: 'PEDESTRIAN_NOT_FOUND',
            error_message: error.message,
            details: {
              pedestrian_id: error.pedestrianId,
            },
          },
          404
        )
      }

      if (error instanceof FloorNotFoundError) {
        return c.json(
          {
            error_code: 'FLOOR_NOT_FOUND',
            error_message: error.message,
            details: {
              floor_id: error.floorId,
            },
          },
          404
        )
      }

      throw error
    }
  })
}
