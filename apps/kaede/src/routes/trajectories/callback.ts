import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../../schemas/common.js'
import {
  callbackErrorResponseSchema,
  callbackRequestSchema,
  callbackResponseSchema,
} from '../../schemas/trajectories.js'
import { notImplemented } from '../../utils/not-implemented.js'

export const registerCallbackRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/callback',
    tags: ['Trajectories'],
    description: '外部解析基盤からの callback を受け取り、trajectory の状態を更新する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: callbackRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'callback accepted',
        content: {
          'application/json': {
            schema: callbackResponseSchema,
          },
        },
      },
      400: {
        description: 'callback payload が不正',
        content: {
          'application/json': {
            schema: callbackErrorResponseSchema,
          },
        },
      },
      401: {
        description: 'callback token を検証できない',
        content: {
          'application/json': {
            schema: callbackErrorResponseSchema,
          },
        },
      },
      404: {
        description: 'trajectory が存在しない',
        content: {
          'application/json': {
            schema: callbackErrorResponseSchema,
          },
        },
      },
      409: {
        description: 'callback 内容が trajectory の現在状態または想定保存先と矛盾する',
        content: {
          'application/json': {
            schema: callbackErrorResponseSchema,
          },
        },
      },
      503: {
        description: '依存先確認または状態更新に失敗したため再送可能',
        content: {
          'application/json': {
            schema: callbackErrorResponseSchema,
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
    c.req.valid('json')

    return notImplemented(c, 'POST /api/trajectories/callback', '解析 callback を反映する')
  })
}
