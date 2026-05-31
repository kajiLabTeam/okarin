import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono, RouteConfig } from '@hono/zod-openapi'
import { pedestriansListResponseSchema } from '../../schemas/pedestrians.js'
import { listPedestrians } from '../../usecases/list-pedestrians.js'

export const registerListPedestriansRoute = (app: OpenAPIHono) => {
  const route: RouteConfig = createRoute({
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
    },
  })

  app.openapi(route, async (c) => {
    const result = await listPedestrians()

    return c.json(result, 200)
  })
}
