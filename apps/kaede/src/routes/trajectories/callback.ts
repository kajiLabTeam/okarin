import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import {
  callbackErrorResponseSchema,
  callbackRequestSchema,
  callbackResponseSchema,
} from '../../schemas/trajectories.js'
import { receiveCallback } from '../../usecases/receive-callback.js'

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
    },
  })

  app.openapi(
    route,
    async (c) => {
      const payload = c.req.valid('json')
      const result = await receiveCallback(payload)

      if (!result.ok) {
        switch (result.error.type) {
          case 'CALLBACK_TOKEN_INVALID':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'callback token is invalid',
              },
              401
            )

          case 'CALLBACK_TOKEN_EXPIRED':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'callback token has expired',
              },
              401
            )

          case 'TRAJECTORY_NOT_FOUND':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'trajectory not found',
                details: {
                  trajectory_id: result.error.trajectoryId,
                },
              },
              404
            )

          case 'CALLBACK_TRAJECTORY_MISMATCH':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'trajectory_id in token and body do not match',
                details: {
                  trajectory_id: result.error.trajectoryId,
                  token_trajectory_id: result.error.tokenTrajectoryId,
                },
              },
              409
            )

          case 'CALLBACK_RESULT_OBJECT_KEY_MISMATCH':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'result_object_key does not match the expected object key',
                details: {
                  trajectory_id: result.error.trajectoryId,
                  result_object_key: result.error.resultObjectKey,
                },
              },
              409
            )

          case 'CALLBACK_ALREADY_FINALIZED':
            return c.json(
              {
                error_code: result.error.type,
                error_message:
                  'trajectory is already finalized with a conflicting callback payload',
                details: {
                  trajectory_id: result.error.trajectoryId,
                  status: result.error.status,
                },
              },
              409
            )

          case 'CALLBACK_DEPENDENCY_FAILURE':
            return c.json(
              {
                error_code: result.error.type,
                error_message: 'failed to verify object or update trajectory state',
                details: {
                  trajectory_id: result.error.trajectoryId,
                },
              },
              503
            )

          default: {
            const exhaustiveCheck: never = result.error
            throw new Error(`unhandled callback error: ${JSON.stringify(exhaustiveCheck)}`)
          }
        }
      }

      return c.json(result.value, 200)
    },
    (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error_code: 'CALLBACK_PAYLOAD_INVALID' as const,
            error_message: 'callback payload is invalid',
            details: {
              issues: result.error.issues,
            },
          },
          400
        )
      }
    }
  )
}
