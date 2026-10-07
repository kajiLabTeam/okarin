import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema, uuidSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  positioningAnalysisRunDetailSchema,
  positioningAnalysisRunRequestSchema,
  positioningAnalysisRunResponseSchema,
} from '../../schemas/positioning-analysis-runs.js'
import { createPositioningAnalysisRun } from '../../usecases/analysis-runs/create-positioning-analysis-run.js'
import { getPositioningAnalysisRun } from '../../usecases/analysis-runs/get-positioning-analysis-run.js'
const errors = {
  description: 'positioning analysis request failed',
  content: { 'application/json': { schema: errorResponseSchema } },
} as const
const errorBody = (error: { type: string }) => ({
  error_code: error.type,
  error_message: 'positioning analysis request failed',
})
export const registerPositioningAnalysisRunRoutes = (app: OpenAPIHono) => {
  const create = createRoute({
    method: 'post',
    path: '/{organizationId}/positioning-analysis-runs',
    tags: ['Organizations'],
    request: {
      params: organizationIdParamsSchema,
      headers: z
        .object({ 'idempotency-key': z.string().min(1).max(200) })
        .openapi('IdempotencyHeader'),
      body: { content: { 'application/json': { schema: positioningAnalysisRunRequestSchema } } },
    },
    responses: {
      202: {
        description: 'accepted',
        content: { 'application/json': { schema: positioningAnalysisRunResponseSchema } },
      },
      400: errors,
      403: errors,
      404: errors,
      409: errors,
      502: errors,
    },
  })
  app.openapi(create, async (c) => {
    const key = c.req.header('Idempotency-Key') ?? ''
    const result = await createPositioningAnalysisRun(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId,
      key,
      c.req.valid('json')
    )
    if (result.ok) return c.json(result.value, 202)
    const status = (result.error.status ?? 400) as 400 | 403 | 404 | 409 | 502
    return c.json(errorBody(result.error), status)
  })
  const detail = createRoute({
    method: 'get',
    path: '/{organizationId}/positioning-analysis-runs/{analysisRunId}',
    tags: ['Organizations'],
    request: { params: organizationIdParamsSchema.extend({ analysisRunId: uuidSchema }) },
    responses: {
      200: {
        description: 'detail',
        content: { 'application/json': { schema: positioningAnalysisRunDetailSchema } },
      },
      403: errors,
      404: errors,
    },
  })
  app.openapi(detail, async (c) => {
    const params = c.req.valid('param')
    const result = await getPositioningAnalysisRun(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.analysisRunId
    )
    if (result.ok) return c.json(result.value, 200)
    return c.json(
      errorBody(result.error),
      result.error.type === 'ANALYSIS_RUN_NOT_FOUND' ? 404 : 403
    )
  })
}
