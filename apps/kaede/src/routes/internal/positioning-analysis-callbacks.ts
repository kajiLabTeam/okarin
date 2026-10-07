import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  positioningAnalysisCallbackRequestSchema,
  positioningAnalysisCallbackResponseSchema,
} from '../../schemas/positioning-analysis-callbacks.js'
import { receivePositioningAnalysisCallback } from '../../usecases/analysis-runs/receive-positioning-analysis-callback.js'

const errors = {
  description: 'callback error',
  content: { 'application/json': { schema: errorResponseSchema } },
} as const

export const registerPositioningAnalysisCallbackRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/pipeline-executions/callbacks',
    tags: ['Internal'],
    description: 'Nozomiからの測位Pipeline実行完了・失敗コールバックを受信し保存する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: positioningAnalysisCallbackRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'callback processed',
        content: {
          'application/json': {
            schema: positioningAnalysisCallbackResponseSchema,
          },
        },
      },
      400: errors,
      401: errors,
      404: errors,
      500: errors,
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c as RequestActorContext)
    const payload = c.req.valid('json')
    const result = await receivePositioningAnalysisCallback(actor, payload)

    if (result.ok) {
      return c.json(result.value, 200)
    }

    const status = result.error.status as 400 | 401 | 404 | 500
    return c.json(
      {
        error_code: result.error.type,
        error_message: result.error.message ?? 'callback handling failed',
      },
      status
    )
  })
}
