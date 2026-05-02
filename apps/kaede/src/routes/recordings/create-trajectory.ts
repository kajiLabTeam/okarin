import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, notImplementedResponseSchema } from '../../schemas/common.js'
import { recordingIdParamsSchema } from '../../schemas/recordings.js'
import {
  createTrajectoryRequestSchema,
  createTrajectoryResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCreateTrajectoryRoute = (app: OpenAPIHono) => {
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
      404: {
        description: 'recording が存在しない',
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
      422: {
        description: 'constraints などの request 内容が不正',
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
      501: {
        description: 'not implemented',
        content: {
          'application/json': {
            schema: notImplementedResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, (c) => {
    c.req.valid('param')
    c.req.valid('json')

    return notImplemented(
      c,
      'POST /api/recordings/:recordingId/trajectories',
      'trajectory を作成して解析を開始する'
    )
  })
}
