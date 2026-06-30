import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingIdParamsSchema,
  recordingTrajectoriesResponseSchema,
} from '../../schemas/recordings.js'
import { listRecordingTrajectories } from '../../usecases/recordings/list-recording-trajectories.js'
import { toListRecordingTrajectoriesErrorResponse } from './error.js'

export const registerListRecordingTrajectoriesRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/{recordingId}/trajectories',
    tags: ['Recordings'],
    description: 'recording に紐づく trajectory の一覧を返す',
    request: {
      params: recordingIdParamsSchema,
    },
    responses: {
      200: {
        description: 'recording trajectories',
        content: {
          'application/json': {
            schema: recordingTrajectoriesResponseSchema,
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
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const actor = requireRequestActor(c)
    const result = await listRecordingTrajectories(actor, params)

    if (!result.ok) {
      const error = toListRecordingTrajectoriesErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
