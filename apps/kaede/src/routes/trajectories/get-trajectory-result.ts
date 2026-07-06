import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryResultResponseSchema,
} from '../../schemas/trajectories.js'
import { getTrajectoryResult } from '../../usecases/trajectories/get-trajectory-result.js'
import { toGetTrajectoryResultErrorResponse } from './error.js'

export const registerGetTrajectoryResultRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{trajectoryId}/result',
    tags: ['Trajectories'],
    description: 'trajectory の解析結果を取得する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory 結果取得 URL',
        content: {
          'application/json': {
            schema: trajectoryResultResponseSchema,
          },
        },
      },
      404: {
        description: 'trajectory が存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'trajectory の現在状態では結果を取得できない',
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
    const params = c.req.valid('param')
    const actor = requireRequestActor(c as unknown as RequestActorContext)
    const result = await getTrajectoryResult(actor, params)

    if (!result.ok) {
      const error = toGetTrajectoryResultErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
