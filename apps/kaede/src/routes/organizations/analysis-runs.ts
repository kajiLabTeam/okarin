import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import {
  analysisRunDetailResponseSchema,
  analysisRunListResponseSchema,
  analysisRunParamsSchema,
  analysisRunResultResponseSchema,
  listAnalysisRunsQuerySchema,
} from '../../schemas/analysis-runs.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  getAnalysisRun,
  getAnalysisRunResult,
  listAnalysisRuns,
} from '../../usecases/analysis-runs/get-analysis-runs.js'

const errorResponse = {
  description: 'analysis run request failed',
  content: { 'application/json': { schema: errorResponseSchema } },
} as const

const toError = (error: {
  type: string
  status?: string
  errorCode?: string | null
}): { status: 400 | 403 | 404 | 409; body: { error_code: string; error_message: string } } => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return { status: 403, body: { error_code: error.type, error_message: 'permission denied' } }
    case 'ANALYSIS_RUN_NOT_FOUND':
      return {
        status: 404,
        body: { error_code: error.type, error_message: 'analysis run not found' },
      }
    case 'ANALYSIS_RESULT_NOT_READY':
      return {
        status: 409,
        body: {
          error_code: error.errorCode ?? error.type,
          error_message: `analysis result is not available (${error.status})`,
        },
      }
    case 'ANALYSIS_RESULT_INVALID':
      return {
        status: 409,
        body: { error_code: error.type, error_message: 'analysis result is invalid' },
      }
    default:
      return { status: 400, body: { error_code: error.type, error_message: 'invalid request' } }
  }
}

export const registerAnalysisRunRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/analysis-runs',
    tags: ['Organizations'],
    request: { params: organizationIdParamsSchema, query: listAnalysisRunsQuerySchema },
    responses: {
      200: {
        description: 'analysis runs',
        content: { 'application/json': { schema: analysisRunListResponseSchema } },
      },
      400: errorResponse,
      403: errorResponse,
      404: errorResponse,
      409: errorResponse,
    },
  })
  app.openapi(listRoute, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await listAnalysisRuns(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      c.req.valid('query')
    )
    if (result.ok) return c.json(result.value, 200)
    const error = toError(result.error)
    if (error.status === 403) return c.json(error.body, 403)
    if (error.status === 404) return c.json(error.body, 404)
    if (error.status === 409) return c.json(error.body, 409)
    return c.json(error.body, 400)
  })

  const detailRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/analysis-runs/{analysisRunId}',
    tags: ['Organizations'],
    request: { params: analysisRunParamsSchema },
    responses: {
      200: {
        description: 'analysis run',
        content: { 'application/json': { schema: analysisRunDetailResponseSchema } },
      },
      403: errorResponse,
      404: errorResponse,
      400: errorResponse,
      409: errorResponse,
    },
  })
  app.openapi(detailRoute, async (c) => {
    const { organizationId, analysisRunId } = c.req.valid('param')
    const result = await getAnalysisRun(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      analysisRunId
    )
    if (result.ok) return c.json(result.value, 200)
    const error = toError(result.error)
    if (error.status === 403) return c.json(error.body, 403)
    if (error.status === 404) return c.json(error.body, 404)
    if (error.status === 409) return c.json(error.body, 409)
    return c.json(error.body, 400)
  })

  const resultRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/analysis-runs/{analysisRunId}/result',
    tags: ['Organizations'],
    request: { params: analysisRunParamsSchema },
    responses: {
      200: {
        description: 'analysis result',
        content: { 'application/json': { schema: analysisRunResultResponseSchema } },
      },
      403: errorResponse,
      404: errorResponse,
      409: errorResponse,
      400: errorResponse,
    },
  })
  app.openapi(resultRoute, async (c) => {
    const { organizationId, analysisRunId } = c.req.valid('param')
    const result = await getAnalysisRunResult(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      analysisRunId
    )
    if (result.ok) return c.json(result.value, 200)
    const error = toError(result.error)
    if (error.status === 403) return c.json(error.body, 403)
    if (error.status === 404) return c.json(error.body, 404)
    if (error.status === 409) return c.json(error.body, 409)
    return c.json(error.body, 400)
  })
}
