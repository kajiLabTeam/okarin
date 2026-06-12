import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { createPedestrianRequestSchema, pedestrianSchema } from '../../schemas/pedestrians.js'
import { createPedestrian } from '../../usecases/create-pedestrian.js'
import type { CreatePedestrianResult } from '../../usecases/create-pedestrian.js'

type CreatePedestrianError = Extract<CreatePedestrianResult, { ok: false }>['error']

const toCreatePedestrianErrorResponse = (error: CreatePedestrianError) => {
  return {
    body: {
      error_code: error.type,
      error_message: 'organization not found',
      details: {
        organization_id: error.organizationId,
      },
    },
    status: 404 as const,
  }
}

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
      404: {
        description: 'organization not found',
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
    const result = await createPedestrian(payload)

    if (!result.ok) {
      const error = toCreatePedestrianErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
