import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { pedestriansListResponseSchema } from '../../schemas/pedestrians.js'
import { listPedestrians } from '../../usecases/pedestrians/list-pedestrians.js'
import { toListPedestriansErrorResponse } from './error.js'

export const registerListPedestriansRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['Pedestrians'],
    description: '計測対象として選択可能な pedestrian 一覧を返す',
    responses: {
      200: {
        description: 'pedestrian list',
        content: {
          'application/json': {
            schema: pedestriansListResponseSchema,
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
    const actor = requireRequestActor(c)
    const result = await listPedestrians(actor)

    if (!result.ok) {
      const error = toListPedestriansErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
