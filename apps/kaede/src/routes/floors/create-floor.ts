import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { createFloorRequestSchema, floorSchema } from '../../schemas/floors.js'
import { createFloor } from '../../usecases/create-floor.js'

export const registerCreateFloorRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Floors'],
    description: 'building に紐づく floor を作成する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: createFloorRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'floor created',
        content: {
          'application/json': {
            schema: floorSchema,
          },
        },
      },
      404: {
        description: 'building not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await createFloor(payload)

    if (!result.ok) {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'building_id does not exist',
          details: {
            building_id: result.error.buildingId,
          },
        },
        404
      )
    }

    return c.json(result.value, 201)
  })
}
