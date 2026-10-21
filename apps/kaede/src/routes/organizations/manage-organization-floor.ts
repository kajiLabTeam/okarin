import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  floorSchema,
  organizationFloorIdParamsSchema,
  updateFloorRequestSchema,
} from '../../schemas/floors.js'
import { deleteFloor } from '../../usecases/floors/delete-floor.js'
import type { DeleteFloorResult } from '../../usecases/floors/delete-floor.js'
import { updateFloor } from '../../usecases/floors/update-floor.js'
import type { UpdateFloorResult } from '../../usecases/floors/update-floor.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type ManageFloorError =
  | Extract<UpdateFloorResult, { ok: false }>['error']
  | Extract<DeleteFloorResult, { ok: false }>['error']

const toErrorResponse = (error: ManageFloorError) => {
  if (error.type === 'AUTH_DASHBOARD_FORBIDDEN' || error.type === 'AUTH_ORGANIZATION_FORBIDDEN') {
    return toAuthorizationErrorResponse(error)
  }

  if (error.type === 'FLOOR_UPDATE_INVALID') {
    return {
      body: { error_code: error.type, error_message: 'floor update request is invalid' },
      status: 400 as const,
    }
  }

  return {
    body: {
      error_code: error.type,
      error_message: 'floor not found',
      details: { floor_id: error.floorId },
    },
    status: 404 as const,
  }
}

export const registerManageOrganizationFloorRoute = (app: OpenAPIHono) => {
  const patchRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/floors/{floorId}',
    tags: ['Organizations'],
    description: 'organization 内 floor の設定を更新する',
    request: {
      params: organizationFloorIdParamsSchema,
      body: { content: { 'application/json': { schema: updateFloorRequestSchema } } },
    },
    responses: {
      200: {
        description: 'floor updated',
        content: { 'application/json': { schema: floorSchema } },
      },
      400: {
        description: 'invalid request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'floor not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(patchRoute, async (c) => {
    const { organizationId, floorId } = c.req.valid('param')
    const result = await updateFloor(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      floorId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = toErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{organizationId}/floors/{floorId}',
    tags: ['Organizations'],
    description: 'organization 内 floor を非表示にする',
    request: { params: organizationFloorIdParamsSchema },
    responses: {
      204: { description: 'floor deleted' },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'floor not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(deleteRoute, async (c) => {
    const { organizationId, floorId } = c.req.valid('param')
    const result = await deleteFloor(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      floorId
    )
    if (!result.ok) {
      const error = toErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.body(null, 204)
  })
}
