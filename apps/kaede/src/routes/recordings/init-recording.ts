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
import { toAuthorizationErrorResponse } from '../authorization-error.js'

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

    switch (result.error.type) {
      case 'AUTH_DASHBOARD_FORBIDDEN':
      case 'AUTH_ORGANIZATION_FORBIDDEN': {
        const error = toAuthorizationErrorResponse(result.error)
        return c.json(error.body, error.status)
      }
      case 'PEDESTRIAN_NOT_FOUND':
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
      case 'FLOOR_NOT_FOUND':
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
      case 'RESOURCE_ORGANIZATION_MISMATCH':
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
      default: {
        const exhaustiveCheck: never = result.error
        throw new Error(`unhandled init-recording error: ${JSON.stringify(exhaustiveCheck)}`)
      }
    }
  })
}
