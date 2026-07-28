import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { paginationQuerySchema } from '../../schemas/pagination.js'
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
      query: paginationQuerySchema,
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
      400: {
        description: 'invalid request parameter, pagination query, or cursor',
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

  app.openapi(
    route,
    async (c) => {
      const params = c.req.valid('param')
      const query = c.req.valid('query')
      const actor = requireRequestActor(c)
      const result = await listRecordingTrajectories(actor, params, query)

      if (!result.ok) {
        const error = toListRecordingTrajectoriesErrorResponse(result.error)
        return c.json(error.body, error.status)
      }

      return c.json(result.value, 200)
    },
    (result, c) => {
      if (!result.success && result.target === 'query') {
        return c.json(
          {
            error_code: 'PAGINATION_QUERY_INVALID',
            error_message: 'pagination query is invalid',
          },
          400
        )
      }

      if (!result.success && result.target === 'param') {
        return c.json(
          {
            error_code: 'REQUEST_PARAMS_INVALID',
            error_message: 'request parameters are invalid',
          },
          400
        )
      }
    }
  )
}
