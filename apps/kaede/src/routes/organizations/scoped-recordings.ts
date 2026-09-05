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
  failRecordingRequestSchema,
  recordingDetailResponseSchema,
} from '../../schemas/recordings.js'
import {
  findRecordingAuthorizationByIdForOrganization,
  findRecordingByIdForOrganization,
} from '../../services/recordings/index.js'
import { requireRecordingAccess } from '../../usecases/authorization.js'
import { completeUpload } from '../../usecases/recordings/complete-upload.js'
import { failRecordingUpload } from '../../usecases/recordings/fail-upload.js'
import { initRecording } from '../../usecases/recordings/init-recording.js'
import { toRecordingDetailResponse } from '../../usecases/recordings/recording-response.js'
import { refreshUploadUrls } from '../../usecases/recordings/refresh-upload-urls.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'
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
  const statusRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/recordings/{recordingId}',
    tags: ['Organization Recordings'],
    description: '指定したOrganizationのrecording状態を取得する',
    request: { params: organizationRecordingParamsSchema },
    responses: {
      200: {
        description: 'recording status',
        content: { 'application/json': { schema: recordingDetailResponseSchema } },
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
    },
  })
  app.openapi(statusRoute, async (c) => {
    const params = c.req.valid('param')
    const recording = await findRecordingByIdForOrganization(
      params.recordingId,
      params.organizationId
    )
    if (!recording) return c.json(notFound().body, 404)
    const authorizationRow = await findRecordingAuthorizationByIdForOrganization(
      recording.id,
      params.organizationId
    )
    if (!authorizationRow) return c.json(notFound().body, 404)
    const authorization = requireRecordingAccess(
      requireRequestActor(c as RequestActorContext),
      authorizationRow
    )
    if (!authorization.ok) {
      const error = toAuthorizationErrorResponse(authorization.error)
      return c.json(error.body, error.status)
    }
    return c.json(toRecordingDetailResponse(recording), 200)
  })

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
      422: {
        description: 'uploaded file is invalid',
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

  const failRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/recordings/{recordingId}/fail',
    tags: ['Organization Recordings'],
    description: '指定したOrganizationのrecordingを失敗として確定する',
    request: {
      params: organizationRecordingParamsSchema,
      body: { content: { 'application/json': { schema: failRecordingRequestSchema } } },
    },
    responses: {
      200: {
        description: 'upload failed',
        content: { 'application/json': { schema: completeUploadResponseSchema } },
      },
      400: {
        description: 'invalid failure request',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'already finalized',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(failRoute, async (c) => {
    const params = c.req.valid('param')
    const result = await failRecordingUpload(
      requireRequestActor(c as RequestActorContext),
      { recordingId: params.recordingId },
      c.req.valid('json'),
      params.organizationId
    )
    if (!result.ok) {
      if (result.error.type === 'RECORDING_NOT_FOUND') return c.json(notFound().body, 404)
      if (result.error.type === 'FAILED_REQUEST_INVALID')
        return c.json(
          { error_code: result.error.type, error_message: 'failure request is invalid' },
          400
        )
      if (
        result.error.type === 'AUTH_DASHBOARD_FORBIDDEN' ||
        result.error.type === 'AUTH_ORGANIZATION_FORBIDDEN'
      )
        return c.json({ error_code: result.error.type, error_message: 'permission denied' }, 403)
      return c.json(
        {
          error_code: result.error.type,
          error_message:
            result.error.type === 'RECORDING_UPLOAD_CONFLICT'
              ? 'recording upload state changed concurrently'
              : 'recording upload is already finalized',
        },
        409
      )
    }
    return c.json(result.value, 200)
  })
}
