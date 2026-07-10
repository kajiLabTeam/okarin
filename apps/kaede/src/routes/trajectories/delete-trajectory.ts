import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { trajectoryIdParamsSchema } from '../../schemas/trajectories.js'
import { deleteTrajectory } from '../../usecases/trajectories/delete-trajectory.js'
import { toDeleteTrajectoryErrorResponse } from './error.js'

export const registerDeleteTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'delete',
    path: '/{trajectoryId}',
    tags: ['Trajectories'],
    description: '指定した trajectory を論理削除する',
    request: {
      params: trajectoryIdParamsSchema,
    },
    responses: {
      204: {
        description: 'trajectory 削除完了',
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
    const result = await deleteTrajectory(actor, params)

    if (!result.ok) {
      const error = toDeleteTrajectoryErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.body(null, 204)
  })
}
