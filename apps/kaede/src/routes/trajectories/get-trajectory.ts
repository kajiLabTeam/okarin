import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  trajectoryIdParamsSchema,
  trajectoryStatusResponseSchema,
} from '../../schemas/trajectories.js'
import { getTrajectory } from '../../usecases/trajectories/get-trajectory.js'
import { toGetTrajectoryErrorResponse } from './error.js'

export const registerGetTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{trajectoryId}',
    tags: ['Trajectories'],
    description: 'trajectory の解析状態と失敗情報を返す',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      200: {
        description: 'trajectory status',
        content: {
          'application/json': {
            schema: trajectoryStatusResponseSchema,
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
    const result = await getTrajectory(actor, params)

    if (!result.ok) {
      const error = toGetTrajectoryErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
