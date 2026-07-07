import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  recordingConstraintsResponseSchema,
  recordingIdParamsSchema,
  updateRecordingConstraintsRequestSchema,
} from '../../schemas/recordings.js'
import { updateRecordingConstraints } from '../../usecases/recordings/update-recording-constraints.js'
import { toUpdateRecordingConstraintsErrorResponse } from './error.js'

export const registerUpdateRecordingConstraintsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'put',
    path: '/{recordingId}/constraints',
    tags: ['Recordings'],
    description: 'recording のデフォルト解析条件を全置換する',
    request: {
      params: recordingIdParamsSchema,
      body: {
        content: {
          'application/json': { schema: updateRecordingConstraintsRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'recording constraints updated',
        content: { 'application/json': { schema: recordingConstraintsResponseSchema } },
      },
      400: {
        description: 'constraints are invalid',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'recording not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c)
    const result = await updateRecordingConstraints(actor, params, payload)

    if (!result.ok) {
      const error = toUpdateRecordingConstraintsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
