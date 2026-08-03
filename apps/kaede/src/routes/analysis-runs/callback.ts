import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import {
  analysisCallbackErrorResponseSchema,
  analysisCallbackRequestSchema,
  analysisCallbackResponseSchema,
} from '../../schemas/analysis-runs.js'
import { receiveAnalysisCallback } from '../../usecases/analysis-runs/receive-callback.js'

export const registerAnalysisCallbackRoute = (app: OpenAPIHono) => {
  const errorResponse = {
    description: 'callback rejected',
    content: { 'application/json': { schema: analysisCallbackErrorResponseSchema } },
  } as const
  const route = createRoute({
    method: 'post',
    path: '/callback',
    tags: ['Analysis runs'],
    request: {
      body: { content: { 'application/json': { schema: analysisCallbackRequestSchema } } },
    },
    responses: {
      200: {
        description: 'callback accepted',
        content: { 'application/json': { schema: analysisCallbackResponseSchema } },
      },
      400: errorResponse,
      401: errorResponse,
      404: errorResponse,
      409: errorResponse,
      500: errorResponse,
    },
  })

  app.openapi(route, async (c) => {
    const result = await receiveAnalysisCallback(c.req.valid('json'))
    if (result.ok) return c.json(result.value, 200)

    const responses = {
      CALLBACK_TOKEN_INVALID: [401, 'callback token is invalid'],
      CALLBACK_TOKEN_EXPIRED: [401, 'callback token has expired'],
      ANALYSIS_RUN_NOT_FOUND: [404, 'analysis run not found'],
      CALLBACK_ANALYSIS_RUN_MISMATCH: [409, 'analysis run ID does not match token'],
      CALLBACK_ALREADY_FINALIZED: [409, 'analysis run is already finalized'],
      CALLBACK_ARTIFACT_INVALID: [409, 'analysis artifact is invalid'],
    } as const
    const [status, message] = responses[result.error.type]
    return c.json({ error_code: result.error.type, error_message: message }, status)
  })
}
