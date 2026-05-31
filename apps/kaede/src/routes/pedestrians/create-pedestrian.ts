import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createPedestrianRequestSchema, pedestrianSchema } from '../../schemas/pedestrians.js'
import { createPedestrian } from '../../usecases/create-pedestrian.js'

export const registerCreatePedestrianRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Pedestrians'],
    description: '計測対象 pedestrian を作成する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createPedestrianRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'pedestrian created',
        content: {
          'application/json': {
            schema: pedestrianSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await createPedestrian(payload)

    return c.json(result, 201)
  })
}
