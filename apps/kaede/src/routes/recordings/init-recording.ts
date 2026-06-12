import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
} from '../../schemas/recordings.js'
import { initRecording } from '../../usecases/init-recording.js'

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
      409: {
        description: 'pedestrian と floor の organization が一致しない',
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
    const result = await initRecording(payload)

    if (!result.ok && result.error.type === 'PEDESTRIAN_NOT_FOUND') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'pedestrian_id does not exist',
          details: {
            pedestrian_id: result.error.pedestrianId,
          },
        },
        404
      )
    }

    if (!result.ok && result.error.type === 'FLOOR_NOT_FOUND') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'floor_id does not exist',
          details: {
            floor_id: result.error.floorId,
          },
        },
        404
      )
    }

    if (!result.ok && result.error.type === 'RESOURCE_ORGANIZATION_MISMATCH') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'pedestrian and floor belong to different organizations',
          details: {
            pedestrian_id: result.error.pedestrianId,
            pedestrian_organization_id: result.error.pedestrianOrganizationId,
            floor_id: result.error.floorId,
            floor_organization_id: result.error.floorOrganizationId,
          },
        },
        409
      )
    }

    return c.json(result.value, 201)
  })
}
