import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { buildingSchema, createBuildingRequestSchema } from '../../schemas/buildings.js'
import { createBuilding } from '../../usecases/create-building.js'

export const registerCreateBuildingRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Buildings'],
    description: 'building を作成する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createBuildingRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'building created',
        content: {
          'application/json': {
            schema: buildingSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await createBuilding(payload)

    return c.json(result, 201)
  })
}
