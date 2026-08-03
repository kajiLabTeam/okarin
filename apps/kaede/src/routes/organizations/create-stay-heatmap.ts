import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import {
  createStayHeatmapErrorResponseSchema,
  createStayHeatmapRequestSchema,
  createStayHeatmapResponseSchema,
} from '../../schemas/analysis-runs.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import { createStayHeatmap } from '../../usecases/analysis-runs/create-stay-heatmap.js'

export const registerCreateStayHeatmapRoute = (app: OpenAPIHono) => {
  const errorResponse = {
    description: 'analysis creation failed',
    content: { 'application/json': { schema: createStayHeatmapErrorResponseSchema } },
  } as const
  const route = createRoute({
    method: 'post',
    path: '/{organizationId}/analyses/stay-heatmaps',
    tags: ['Organizations'],
    request: {
      params: organizationIdParamsSchema,
      body: { content: { 'application/json': { schema: createStayHeatmapRequestSchema } } },
    },
    responses: {
      202: {
        description: 'analysis accepted',
        content: { 'application/json': { schema: createStayHeatmapResponseSchema } },
      },
      400: errorResponse,
      403: errorResponse,
      404: errorResponse,
      409: errorResponse,
      500: errorResponse,
      502: errorResponse,
    },
  })

  app.openapi(route, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await createStayHeatmap(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      c.req.valid('json')
    )
    if (result.ok) return c.json(result.value, 202)

    const runId = 'analysisRunId' in result.error ? result.error.analysisRunId : undefined
    const responses = {
      AUTH_DASHBOARD_FORBIDDEN: [403, 'dashboard write access is required'],
      AUTH_ORGANIZATION_FORBIDDEN: [403, 'organization access is required'],
      TRAJECTORY_NOT_FOUND: [404, 'trajectory not found'],
      FLOOR_NOT_FOUND: [404, 'floor not found'],
      TRAJECTORY_NOT_COMPLETED: [409, 'trajectory is not completed'],
      TRAJECTORY_SCOPE_INVALID: [409, 'trajectory scope is invalid'],
      TRAJECTORY_START_INVALID: [409, 'trajectory start is invalid'],
      FLOOR_ANALYSIS_METADATA_INVALID: [409, 'floor analysis metadata is invalid'],
      ANALYSIS_PREPARATION_FAILED: [500, 'failed to prepare analysis request'],
      NOZOMI_REQUEST_FAILED: [502, 'failed to submit analysis request'],
    } as const
    const [status, message] = responses[result.error.type]
    return c.json(
      {
        error_code: result.error.type,
        error_message: message,
        ...(runId ? { analysis_run_id: runId } : {}),
      },
      status
    )
  })
}
