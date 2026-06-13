import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { createFloorRequestSchema, floorSchema } from '../../schemas/floors.js'
import { createFloor } from '../../usecases/create-floor.js'
import type { CreateFloorResult } from '../../usecases/create-floor.js'

type CreateFloorError = Extract<CreateFloorResult, { ok: false }>['error']

const toCreateFloorErrorResponse = (error: CreateFloorError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
      return {
        body: {
          error_code: error.type,
          error_message: 'dashboard access forbidden',
        },
        status: 403 as const,
      }
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return {
        body: {
          error_code: error.type,
          error_message: 'organization access forbidden',
        },
        status: 403 as const,
      }
    case 'BUILDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'building_id does not exist',
          details: {
            building_id: error.buildingId,
          },
        },
        status: 404 as const,
      }
  }
}

export const registerCreateFloorRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c)
    const result = await createFloor(actor, payload)

    if (!result.ok) {
      const error = toCreateFloorErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
