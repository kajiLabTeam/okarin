import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { organizationBuildingIdParamsSchema } from '../../schemas/buildings.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { createFloorMultipartRequestSchema, floorSchema } from '../../schemas/floors.js'
import type { FloorMapContentType } from '../../services/storage/index.js'
import { createFloor, floorMapImageMaxBytes } from '../../usecases/floors/create-floor.js'
import type { CreateFloorResult } from '../../usecases/floors/create-floor.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type CreateFloorError = Extract<CreateFloorResult, { ok: false }>['error']
const maxMultipartRequestBytes = floorMapImageMaxBytes + 64 * 1024

const badRequest = (errorCode: string, errorMessage: string) => ({
  body: {
    error_code: errorCode,
    error_message: errorMessage,
  },
  status: 400 as const,
})

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
    case 'FLOOR_MAP_IMAGE_INVALID':
      return badRequest('FLOOR_MAP_IMAGE_INVALID', 'floor map image is invalid')
    case 'FLOOR_MAP_IMAGE_TOO_LARGE':
      return {
        body: {
          error_code: error.type,
          error_message: 'floor map image is too large',
          details: {
            max_bytes: error.maxBytes,
          },
        },
        status: 413 as const,
      }
  }
}

const getSingleFormValue = (value: FormDataEntryValue | FormDataEntryValue[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const parseFloorMultipartBody = async (c: Context) => {
  const body = await c.req.parseBody()
  const levelValue = getSingleFormValue(body.level)
  const nameValue = getSingleFormValue(body.name)
  const scaleValue = getSingleFormValue(body.scale)
  const fileValue = getSingleFormValue(body.map_image)

  if (typeof levelValue !== 'string' || typeof nameValue !== 'string') {
    return {
      ok: false,
      error: badRequest('FLOOR_REQUEST_INVALID', 'floor request is invalid'),
    } as const
  }

  if (!(fileValue instanceof File)) {
    return {
      ok: false,
      error: badRequest('FLOOR_MAP_IMAGE_REQUIRED', 'floor map image is required'),
    } as const
  }

  const contentType = fileValue.type.toLowerCase().split(';')[0]?.trim()

  if (contentType !== 'image/png' && contentType !== 'image/svg+xml') {
    return {
      ok: false,
      error: badRequest('FLOOR_MAP_IMAGE_INVALID', 'floor map image is invalid'),
    } as const
  }

  const level = z.coerce.number().int().safeParse(levelValue)
  const scale =
    typeof scaleValue === 'string' && scaleValue.trim().length > 0
      ? z.coerce.number().positive().safeParse(scaleValue)
      : ({ success: true, data: null } as const)

  const payload = {
    level: level.success ? level.data : undefined,
    name: nameValue,
    scale: scale.success ? scale.data : undefined,
  }
  const parsed = z
    .object({
      level: z.number().int(),
      name: z.string().min(1),
      scale: z.number().positive().nullable().optional(),
    })
    .safeParse(payload)

  if (!parsed.success) {
    return {
      ok: false,
      error: badRequest('FLOOR_REQUEST_INVALID', 'floor request is invalid'),
    } as const
  }

  const bytes = new Uint8Array(await fileValue.arrayBuffer())

  return {
    ok: true,
    value: {
      payload: parsed.data,
      mapImage: {
        bytes,
        contentType: contentType as FloorMapContentType,
      },
    },
  } as const
}

export const registerCreateOrganizationBuildingFloorRoute = (app: OpenAPIHono) => {
  app.use(
    '/:organizationId/buildings/:buildingId/floors',
    bodyLimit({
      maxSize: maxMultipartRequestBytes,
      onError: (c) =>
        c.json(
          {
            error_code: 'FLOOR_MAP_IMAGE_TOO_LARGE',
            error_message: 'floor map image is too large',
            details: {
              max_bytes: floorMapImageMaxBytes,
            },
          },
          413
        ),
    })
  )

  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/buildings/{buildingId}/floors',
    tags: ['Organizations'],
    description: 'organization 内 building に floor を作成する',
    request: {
      params: organizationBuildingIdParamsSchema,
      body: {
        content: {
          'multipart/form-data': {
            schema: createFloorMultipartRequestSchema,
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
      400: {
        description: 'invalid request',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      413: {
        description: 'payload too large',
        content: {
          'application/json': {
            schema: errorResponseSchema,
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
    const parsedBody = await parseFloorMultipartBody(c)

    if (!parsedBody.ok) {
      return c.json(parsedBody.error.body, parsedBody.error.status)
    }

    const actor = requireRequestActor(c as RequestActorContext)
    const result = await createFloor(
      actor,
      organizationId,
      buildingId,
      parsedBody.value.payload,
      parsedBody.value.mapImage
    )

    if (!result.ok) {
      const error = toCreateFloorErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
