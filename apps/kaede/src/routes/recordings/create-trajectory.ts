import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { recordingIdParamsSchema } from '../../schemas/recordings.js'
import {
  createTrajectoryRequestSchema,
  createTrajectoryResponseSchema,
} from '../../schemas/trajectories.js'
import { createTrajectory } from '../../usecases/trajectories/create-trajectory.js'
import { toCreateTrajectoryErrorResponse } from './error.js'

export const registerCreateTrajectoryRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/trajectories',
    tags: ['Recordings'],
    description: 'recording から trajectory を作成し、解析を開始する',
    request: {
      params: recordingIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: createTrajectoryRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'trajectory created',
        content: {
          'application/json': {
            schema: createTrajectoryResponseSchema,
          },
        },
      },
      400: {
        description: 'constraints などの request 内容が不正',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'recording または floor が存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'recording の現在状態では trajectory を作成できない',
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
      500: {
        description:
          'recording の内部データ不整合または解析依頼準備失敗により trajectory を作成できない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      502: {
        description: '解析サーバーへの依頼に失敗した',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const body = c.req.valid('json')
    const actor = requireRequestActor(c)
    const result = await createTrajectory(actor, params, body)

    if (!result.ok) {
      const error = toCreateTrajectoryErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 201)
  })
}
