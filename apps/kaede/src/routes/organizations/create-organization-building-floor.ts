import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { organizationBuildingIdParamsSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { createFloorRequestSchema, createFloorResponseSchema } from '../../schemas/floors.js'
import { createFloor } from '../../usecases/floors/create-floor.js'
import type { CreateFloorResult } from '../../usecases/floors/create-floor.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type CreateFloorError = Extract<CreateFloorResult, { ok: false }>['error']

const toCreateFloorErrorResponse = (error: CreateFloorError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'BUILDING_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'building not found',
          details: {
            building_id: error.buildingId,
          },
        },
        status: 404 as const,
      }
  }
}

export const registerCreateOrganizationBuildingFloorRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/buildings/{buildingId}/floors',
    tags: ['Organizations'],
    description: 'organization 内 building に floor を作成する',
    request: {
      params: organizationBuildingIdParamsSchema,
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
            schema: createFloorResponseSchema,
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
    const { buildingId, organizationId } = c.req.valid('param')
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c as RequestActorContext)
    const result = await createFloor(actor, organizationId, buildingId, payload)

    if (!result.ok) {
      const error = toCreateFloorErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
