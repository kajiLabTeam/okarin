import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { recordingsResponseSchema } from '../../schemas/recordings.js'
import { listMyRecordings } from '../../usecases/pedestrians/list-my-recordings.js'
import { toListMyRecordingsErrorResponse } from './error.js'

export const registerListMyRecordingsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/me/recordings',
    tags: ['Pedestrians'],
    description: 'ログイン user に紐づく pedestrian の recording 一覧を返す',
    responses: {
      200: {
        description: 'current pedestrian recordings',
        content: {
          'application/json': {
            schema: recordingsResponseSchema,
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
        description: 'pedestrian not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c)
    const result = await listMyRecordings(actor)

    if (!result.ok) {
      const error = toListMyRecordingsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
