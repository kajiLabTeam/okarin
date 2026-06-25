import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { buildingSchema, createBuildingRequestSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import { createBuilding } from '../../usecases/buildings/create-building.js'
import type { CreateBuildingResult } from '../../usecases/buildings/create-building.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type CreateBuildingError = Extract<CreateBuildingResult, { ok: false }>['error']

const toCreateBuildingErrorResponse = (error: CreateBuildingError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'ORGANIZATION_NOT_FOUND':
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
}

export const registerCreateOrganizationBuildingRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/buildings',
    tags: ['Organizations'],
    description: 'organization に building を作成する',
    request: {
      params: organizationIdParamsSchema,
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
    const { organizationId } = c.req.valid('param')
    const payload = c.req.valid('json')
    const actor = requireRequestActor(c as RequestActorContext)
    const result = await createBuilding(actor, organizationId, payload)

    if (!result.ok) {
      const error = toCreateBuildingErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
