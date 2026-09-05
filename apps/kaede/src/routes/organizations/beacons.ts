import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import {
  beaconListResponseSchema,
  beaconParamsSchema,
  beaconSchema,
  createBeaconRequestSchema,
  floorBeaconParamsSchema,
  recordingBeaconConfigResponseSchema,
  updateBeaconRequestSchema,
} from '../../schemas/beacons.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { paginationQuerySchema } from '../../schemas/pagination.js'
import {
  createOrganizationBeacon,
  deleteOrganizationBeacon,
  getRecordingBeaconConfig,
  listOrganizationBeacons,
  updateOrganizationBeacon,
} from '../../usecases/beacons/index.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

const querySchema = paginationQuerySchema.extend({
  include_disabled: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((value) => value === 'true'),
})
const errorResponse = (error: { type: string; limit?: number }) => {
  if (error.type === 'AUTH_DASHBOARD_FORBIDDEN' || error.type === 'AUTH_ORGANIZATION_FORBIDDEN')
    return toAuthorizationErrorResponse(
      error as { type: 'AUTH_DASHBOARD_FORBIDDEN' | 'AUTH_ORGANIZATION_FORBIDDEN' }
    )
  if (error.type === 'FLOOR_NOT_FOUND' || error.type === 'BEACON_NOT_FOUND')
    return {
      body: {
        error_code: error.type,
        error_message: error.type === 'FLOOR_NOT_FOUND' ? 'floor not found' : 'beacon not found',
      },
      status: 404 as const,
    }
  if (error.type === 'BEACON_LIMIT_REACHED')
    return {
      body: {
        error_code: error.type,
        error_message: 'floor beacon limit reached',
        details: error.limit === undefined ? {} : { limit: error.limit },
      },
      status: 409 as const,
    }
  if (error.type === 'BEACON_COORDINATES_INVALID')
    return {
      body: {
        error_code: error.type,
        error_message: 'beacon coordinates are outside the floor map',
      },
      status: 400 as const,
    }
  if (error.type === 'BEACON_FORMAT_INVALID')
    return {
      body: { error_code: error.type, error_message: 'iBeacon format_config is invalid' },
      status: 400 as const,
    }
  if (error.type === 'PAGINATION_CURSOR_INVALID')
    return {
      body: { error_code: error.type, error_message: 'pagination cursor is invalid' },
      status: 400 as const,
    }
  return {
    body: { error_code: error.type, error_message: 'beacon conflicts with an existing beacon' },
    status: 409 as const,
  }
}

export const registerOrganizationBeaconRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/floors/{floorId}/beacons',
    tags: ['Organizations'],
    request: { params: floorBeaconParamsSchema, query: querySchema },
    responses: {
      200: {
        description: 'beacons',
        content: { 'application/json': { schema: beaconListResponseSchema } },
      },
      400: {
        description: 'invalid request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(listRoute, async (c) => {
    const params = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await listOrganizationBeacons(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.floorId,
      query.include_disabled,
      query
    )
    if (!result.ok) {
      const error = errorResponse(result.error)
      return c.json(error.body, error.status as 400 | 403 | 404)
    }
    return c.json(result.value, 200)
  })

  const configRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/floors/{floorId}/beacons/recording-config',
    tags: ['Organization Recordings'],
    request: { params: floorBeaconParamsSchema },
    responses: {
      200: {
        description: 'recording beacon config',
        content: { 'application/json': { schema: recordingBeaconConfigResponseSchema } },
      },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(configRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await getRecordingBeaconConfig(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.floorId
    )
    if (!result.ok) {
      const error = errorResponse(result.error)
      return c.json(error.body, error.status as 403 | 404)
    }
    return c.json(result.value, 200)
  })

  const createRouteDef = createRoute({
    method: 'post',
    path: '/{organizationId}/floors/{floorId}/beacons',
    tags: ['Organizations'],
    request: {
      params: floorBeaconParamsSchema,
      body: { content: { 'application/json': { schema: createBeaconRequestSchema } } },
    },
    responses: {
      201: {
        description: 'beacon created',
        content: { 'application/json': { schema: beaconSchema } },
      },
      400: {
        description: 'invalid request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'conflict',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(createRouteDef, async (c) => {
    const params = c.req.valid('param')
    const result = await createOrganizationBeacon(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.floorId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = errorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 201)
  })

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/beacons/{beaconId}',
    tags: ['Organizations'],
    request: {
      params: beaconParamsSchema,
      body: { content: { 'application/json': { schema: updateBeaconRequestSchema } } },
    },
    responses: {
      200: {
        description: 'beacon updated',
        content: { 'application/json': { schema: beaconSchema } },
      },
      400: {
        description: 'invalid request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'conflict',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(updateRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await updateOrganizationBeacon(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.beaconId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = errorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{organizationId}/beacons/{beaconId}',
    tags: ['Organizations'],
    request: { params: beaconParamsSchema },
    responses: {
      204: { description: 'beacon deleted' },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(deleteRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await deleteOrganizationBeacon(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.beaconId
    )
    if (!result.ok) {
      const error = errorResponse(result.error)
      return c.json(error.body, error.status as 403 | 404)
    }
    return c.body(null, 204)
  })
}
