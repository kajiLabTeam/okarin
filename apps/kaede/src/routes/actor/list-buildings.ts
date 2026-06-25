import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { buildingsListResponseSchema } from '../../schemas/buildings.js'
import { listBuildings } from '../../usecases/buildings/list-buildings.js'

export const registerListActorBuildingsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/buildings',
    tags: ['Actor'],
    description: '現在の actor がアクセス可能な building 一覧を返す',
    responses: {
      200: {
        description: 'actor accessible building list',
        content: {
          'application/json': {
            schema: buildingsListResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c)
    const result = await listBuildings(actor)

    return c.json(result, 200)
  })
}
