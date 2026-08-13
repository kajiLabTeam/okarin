import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
  refreshUploadUrlsResponseSchema,
  completeUploadResponseSchema,
} from '../../schemas/recordings.js'
import { completeUpload } from '../../usecases/recordings/complete-upload.js'
import { initRecording } from '../../usecases/recordings/init-recording.js'
import { refreshUploadUrls } from '../../usecases/recordings/refresh-upload-urls.js'
import {
  toInitRecordingErrorResponse,
  toRefreshUploadUrlsErrorResponse,
  toCompleteUploadErrorResponse,
} from '../recordings/error.js'

const notFound = () => ({
  body: { error_code: 'RESOURCE_NOT_FOUND', error_message: 'resource not found' },
  status: 404 as const,
})

const organizationRecordingParamsSchema = organizationIdParamsSchema.extend({
  recordingId: recordingIdParamsSchema.shape.recordingId,
})

export const registerOrganizationScopedRecordingRoutes = (app: OpenAPIHono) => {
  const initRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/recordings/init',
    tags: ['Organization Recordings'],
    description: '指定したOrganizationにrecordingを作成する',
    request: {
      params: organizationIdParamsSchema,
      body: { content: { 'application/json': { schema: initRecordingRequestSchema } } },
    },
    responses: {
      201: {
        description: 'recording created',
        content: { 'application/json': { schema: initRecordingResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'organization grant required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'resource not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'resource organization mismatch',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(initRoute, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await initRecording(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('json'),
      organizationId
    )
    if (!result.ok) {
      const error = toInitRecordingErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 201)
  })

  const refreshRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/recordings/{recordingId}/refresh-upload-urls',
    tags: ['Organization Recordings'],
    description: '指定したOrganizationのrecording upload URLを再発行する',
    request: {
      params: organizationRecordingParamsSchema,
      body: { content: { 'application/json': { schema: refreshUploadUrlsRequestSchema } } },
    },
    responses: {
      200: {
        description: 'upload urls refreshed',
        content: { 'application/json': { schema: refreshUploadUrlsResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'organization grant required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'resource not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'upload cannot be refreshed',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(refreshRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await refreshUploadUrls(
      requireRequestActor(c as RequestActorContext),
      { recordingId: params.recordingId },
      c.req.valid('json'),
      params.organizationId
    )
    if (!result.ok) {
      if (result.error.type === 'RECORDING_NOT_FOUND') return c.json(notFound().body, 404)
      const error = toRefreshUploadUrlsErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const completeRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/recordings/{recordingId}/complete-upload',
    tags: ['Organization Recordings'],
    description: '指定したOrganizationのrecording uploadを完了する',
    request: { params: organizationRecordingParamsSchema },
    responses: {
      200: {
        description: 'upload completed',
        content: { 'application/json': { schema: completeUploadResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'organization grant required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'resource not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'upload cannot be completed',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      500: {
        description: 'internal recording data error',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(completeRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await completeUpload(
      requireRequestActor(c as RequestActorContext),
      { recordingId: params.recordingId },
      params.organizationId
    )
    if (!result.ok) {
      if (result.error.type === 'RECORDING_NOT_FOUND') return c.json(notFound().body, 404)
      const error = toCompleteUploadErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
