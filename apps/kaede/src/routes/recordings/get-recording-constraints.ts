import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingConstraintsResponseSchema,
  recordingIdParamsSchema,
} from '../../schemas/recordings.js'
import { getRecordingConstraints } from '../../usecases/recordings/get-recording-constraints.js'
import { toGetRecordingConstraintsErrorResponse } from './error.js'

export const registerGetRecordingConstraintsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/{recordingId}/constraints',
    tags: ['Recordings'],
    description: 'recording のデフォルト解析条件を返す',
    request: { params: recordingIdParamsSchema },
    responses: {
      200: {
        description: 'recording constraints',
        content: { 'application/json': { schema: recordingConstraintsResponseSchema } },
      },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'recording not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      500: {
        description: 'recording constraints stored in the database are invalid',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const actor = requireRequestActor(c)
    const result = await getRecordingConstraints(actor, params)

    if (!result.ok) {
      const error = toGetRecordingConstraintsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
