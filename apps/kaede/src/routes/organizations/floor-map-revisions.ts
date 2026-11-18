import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  floorSchema,
  organizationFloorIdParamsSchema,
  mapRevisionParamsSchema,
  updateMapMultipartSchema,
} from '../../schemas/floors.js'
import { findMapRevision, listMapRevisions } from '../../services/floor-maps/revisions.js'
import { findFloorDetailById } from '../../services/floors/index.js'
import { accessibleOrganizationIds } from '../../usecases/authorization.js'
import { floorMapImageMaxBytes } from '../../usecases/floors/create-floor.js'
import { toFloorResponse } from '../../usecases/floors/floor-response.js'
import { updateMap } from '../../usecases/floors/update-map.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

const errors = {
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
  413: {
    description: 'image too large',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
}

export const registerFloorMapRevisionRoutes = (app: OpenAPIHono) => {
  const path = '/{organizationId}/floors/{floorId}/map-revisions'
  const scope = async (
    c: Parameters<typeof requireRequestActor>[0],
    organizationId: string,
    floorId: string
  ) => {
    const floor = await findFloorDetailById(floorId, { organizationIds: [organizationId] })
    if (!floor)
      return {
        ok: false,
        body: { error_code: 'FLOOR_NOT_FOUND', error_message: 'floor not found' },
        status: 404,
      } as const
    const allowed = accessibleOrganizationIds(requireRequestActor(c))
    if (allowed && !allowed.includes(organizationId))
      return {
        ok: false,
        body: { error_code: 'FLOOR_NOT_FOUND', error_message: 'floor not found' },
        status: 404,
      } as const
    return { ok: true, floor } as const
  }
  app.openapi(
    createRoute({
      method: 'get',
      path,
      tags: ['Organizations'],
      request: { params: organizationFloorIdParamsSchema },
      responses: {
        200: {
          description: 'map revisions',
          content: {
            'application/json': { schema: z.object({ revisions: z.array(floorSchema) }) },
          },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { organizationId, floorId } = c.req.valid('param')
      const scoped = await scope(c as RequestActorContext, organizationId, floorId)
      if (!scoped.ok) return c.json(scoped.body, scoped.status)
      const revisions = await listMapRevisions(floorId, organizationId)
      return c.json(
        {
          revisions: await Promise.all(
            revisions.map((r) =>
              toFloorResponse({
                ...scoped.floor,
                ...r,
                floor_id: floorId,
                floor_map_revision_id: r.id,
              })
            )
          ),
        },
        200
      )
    }
  )
  app.openapi(
    createRoute({
      method: 'get',
      path: `${path}/{revisionId}`,
      tags: ['Organizations'],
      request: { params: mapRevisionParamsSchema },
      responses: {
        200: {
          description: 'map revision',
          content: { 'application/json': { schema: floorSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { organizationId, floorId, revisionId } = c.req.valid('param')
      const scoped = await scope(c as RequestActorContext, organizationId, floorId)
      if (!scoped.ok) return c.json(scoped.body, scoped.status)
      const revision = await findMapRevision(floorId, organizationId, revisionId)
      if (!revision)
        return c.json(
          { error_code: 'FLOOR_MAP_REVISION_NOT_FOUND', error_message: 'map revision not found' },
          404
        )
      return c.json(
        await toFloorResponse({
          ...scoped.floor,
          ...revision,
          floor_id: floorId,
          floor_map_revision_id: revision.id,
        }),
        200
      )
    }
  )
  app.use(
    '/:organizationId/floors/:floorId/map-revisions',
    bodyLimit({
      maxSize: floorMapImageMaxBytes + 65536,
      onError: (c) =>
        c.json(
          { error_code: 'FLOOR_MAP_IMAGE_TOO_LARGE', error_message: 'map image too large' },
          413
        ),
    })
  )
  app.openapi(
    createRoute({
      method: 'post',
      path,
      tags: ['Organizations'],
      request: {
        params: organizationFloorIdParamsSchema,
        body: { content: { 'multipart/form-data': { schema: updateMapMultipartSchema } } },
      },
      responses: {
        201: {
          description: 'map updated',
          content: { 'application/json': { schema: floorSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { organizationId, floorId } = c.req.valid('param')
      const body = await c.req.parseBody()
      const file = body.map_image
      const contentType = file instanceof File ? file.type.toLowerCase().split(';')[0] : undefined
      if (
        !(file instanceof File) ||
        (contentType !== 'image/png' && contentType !== 'image/svg+xml')
      )
        return c.json(
          { error_code: 'FLOOR_MAP_IMAGE_INVALID', error_message: 'PNG or SVG is required' },
          400
        )
      const scale = !Object.hasOwn(body, 'scale')
        ? undefined
        : body.scale === ''
          ? null
          : Number(body.scale)
      if (scale !== undefined && scale !== null && (!Number.isFinite(scale) || scale <= 0))
        return c.json(
          { error_code: 'FLOOR_REQUEST_INVALID', error_message: 'scale must be positive' },
          400
        )
      const result = await updateMap(
        requireRequestActor(c as RequestActorContext),
        organizationId,
        floorId,
        { bytes: new Uint8Array(await file.arrayBuffer()), contentType },
        scale
      )
      if (!result.ok) {
        if (
          result.error.type === 'AUTH_DASHBOARD_FORBIDDEN' ||
          result.error.type === 'AUTH_ORGANIZATION_FORBIDDEN'
        ) {
          const error = toAuthorizationErrorResponse(result.error)
          return c.json(error.body, error.status)
        }
        return c.json(
          { error_code: result.error.type, error_message: 'map update failed' },
          result.error.type === 'FLOOR_NOT_FOUND'
            ? 404
            : result.error.type === 'FLOOR_MAP_IMAGE_TOO_LARGE'
              ? 413
              : 400
        )
      }
      return c.json(result.value, 201)
    }
  )
}
