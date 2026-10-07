import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  pipelineAvailabilityQuerySchema,
  pipelineAvailabilityResponseSchema,
} from '../../schemas/pipelines.js'
import { listPipelineAvailability } from '../../services/nozomi/pipeline-availability.js'
import { NozomiPipelineError } from '../../services/nozomi/pipeline-client.js'
import {
  findRecordingAuthorizationByIdForOrganization,
  findRecordingByIdForOrganization,
} from '../../services/recordings/index.js'
import { requireRecordingAccess } from '../../usecases/authorization.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

export const registerPipelineAvailabilityRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationId}/pipeline-availability',
    tags: ['Organizations'],
    description: 'recording の資産に対する測位 pipeline の利用可否を取得する',
    request: { params: organizationIdParamsSchema, query: pipelineAvailabilityQuerySchema },
    responses: {
      200: {
        description: 'pipeline availability',
        content: { 'application/json': { schema: pipelineAvailabilityResponseSchema } },
      },
      400: {
        description: 'invalid request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'recording access required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'recording not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      502: {
        description: 'Nozomi unavailable or invalid',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(
    route,
    async (c) => {
      const { organizationId } = c.req.valid('param')
      const query = c.req.valid('query')
      const recordingIds = query.recording_ids
      const actor = requireRequestActor(c as RequestActorContext)
      for (const recordingId of recordingIds) {
        const recording = await findRecordingByIdForOrganization(recordingId, organizationId)
        if (!recording) {
          return c.json(
            { error_code: 'RESOURCE_NOT_FOUND', error_message: 'recording not found' },
            404
          )
        }
        const authorizationRow = await findRecordingAuthorizationByIdForOrganization(
          recording.id,
          organizationId
        )
        if (!authorizationRow) {
          return c.json(
            { error_code: 'RESOURCE_NOT_FOUND', error_message: 'recording not found' },
            404
          )
        }
        const authorization = requireRecordingAccess(actor, authorizationRow)
        if (!authorization.ok) {
          const error = toAuthorizationErrorResponse(authorization.error)
          return c.json(error.body, error.status)
        }
      }
      try {
        return c.json(await listPipelineAvailability(recordingIds), 200)
      } catch (error) {
        if (!(error instanceof NozomiPipelineError)) throw error
        return c.json(
          { error_code: error.code, error_message: 'pipeline catalog is unavailable' },
          502
        )
      }
    },
    (result, c) => {
      if (!result.success) {
        return c.json({ error_code: 'REQUEST_INVALID', error_message: 'request is invalid' }, 400)
      }
    }
  )
}
