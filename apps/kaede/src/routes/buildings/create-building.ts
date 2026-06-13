import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { buildingSchema, createBuildingRequestSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { createBuilding } from '../../usecases/create-building.js'
import type { CreateBuildingResult } from '../../usecases/create-building.js'

type CreateBuildingError = Extract<CreateBuildingResult, { ok: false }>['error']

const toCreateBuildingErrorResponse = (error: CreateBuildingError) => {
  if (error.type === 'AUTH_DASHBOARD_FORBIDDEN') {
    return {
      body: {
        error_code: error.type,
        error_message: 'dashboard access forbidden',
      },
      status: 403 as const,
    }
  }

  if (error.type === 'AUTH_ORGANIZATION_FORBIDDEN') {
    return {
      body: {
        error_code: error.type,
        error_message: 'organization access forbidden',
      },
      status: 403 as const,
    }
  }

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

export const registerCreateBuildingRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
      404: {
        description: 'organization not found',
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
    const result = await createBuilding(actor, payload)

    if (!result.ok) {
      const error = toCreateBuildingErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
