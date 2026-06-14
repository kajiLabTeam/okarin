import type { OpenAPIHono, RouteConfig } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { floorsListResponseSchema } from '../../schemas/floors.js'
import { listFloors } from '../../usecases/floors/list-floors.js'

export const registerListFloorsRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route: RouteConfig = createRoute({
    method: 'get',
    path: '/',
    tags: ['Floors'],
    description: '計測場所として選択可能な floor 一覧を building 情報とあわせて返す',
    responses: {
      200: {
        description: 'floor list',
        content: {
          'application/json': {
            schema: floorsListResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c)
    const result = await listFloors(actor)

    return c.json(result, 200)
  })
}
