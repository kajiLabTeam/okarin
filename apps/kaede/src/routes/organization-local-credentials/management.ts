import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getRequestSessionId, requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  disableOrganizationLocalCredentialRequestSchema,
  organizationLocalCredentialParamsSchema,
  organizationLocalCredentialSchema,
  putOrganizationLocalCredentialRequestSchema,
} from '../../schemas/organization-local-credentials.js'
import {
  disableMyOrganizationLocalCredential,
  getMyOrganizationLocalCredential,
  putMyOrganizationLocalCredential,
} from '../../usecases/organization-local-credentials/index.js'
import type { OrganizationLocalCredentialManagementError } from '../../usecases/organization-local-credentials/index.js'

const toErrorResponse = (error: OrganizationLocalCredentialManagementError) => {
  switch (error.type) {
    case 'AUTH_UNAUTHENTICATED':
      return {
        status: 401 as const,
        body: { error_code: error.type, error_message: 'login required' },
      }
    case 'AUTH_INVALID_CREDENTIALS':
      return {
        status: 401 as const,
        body: { error_code: error.type, error_message: 'current password is invalid' },
      }
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return {
        status: 403 as const,
        body: { error_code: error.type, error_message: 'active membership is required' },
      }
    case 'AUTH_METHOD_NOT_ALLOWED':
      return {
        status: 403 as const,
        body: { error_code: error.type, error_message: 'local authentication is disabled' },
      }
    case 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED':
      return {
        status: 403 as const,
        body: {
          error_code: error.type,
          error_message: 'recent membership authentication required',
        },
      }
    case 'LOCAL_CREDENTIAL_NOT_FOUND':
      return {
        status: 404 as const,
        body: { error_code: error.type, error_message: 'local credential not found' },
      }
    case 'LOCAL_CREDENTIAL_LAST_AUTH_METHOD':
      return {
        status: 409 as const,
        body: { error_code: error.type, error_message: 'another usable login method is required' },
      }
    case 'LOCAL_LOGIN_EMAIL_CONFLICT':
      return {
        status: 409 as const,
        body: { error_code: error.type, error_message: 'login email is already in use' },
      }
  }
}

const responses = {
  200: {
    description: 'local credential metadata（secret/hashは返さない）',
    content: { 'application/json': { schema: organizationLocalCredentialSchema } },
  },
  400: {
    description: 'request validation failed',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  401: {
    description: 'login required or current password invalid',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'active membership or recent reauthentication required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'credential not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  409: {
    description: 'Organization内のlogin email conflict',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const

export const registerOrganizationLocalCredentialRoutes = (app: OpenAPIHono) => {
  const getRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/members/me/local-credential',
    tags: ['Organization Local Credentials'],
    description: '本人のMembership単位Local Credential metadataを取得する',
    request: { params: organizationLocalCredentialParamsSchema },
    responses,
  })

  app.openapi(getRoute, async (c) => {
    const result = await getMyOrganizationLocalCredential(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId
    )
    if (!result.ok) {
      const error = toErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const putRoute = createRoute({
    method: 'put',
    path: '/{organizationId}/members/me/local-credential',
    tags: ['Organization Local Credentials'],
    description:
      '本人がLocal Credentialを初回設定または変更する。current passwordまたは最近のMembership認証を要求する',
    request: {
      params: organizationLocalCredentialParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: putOrganizationLocalCredentialRequestSchema } },
      },
    },
    responses,
  })

  app.openapi(putRoute, async (c) => {
    const result = await putMyOrganizationLocalCredential(
      requireRequestActor(c as RequestActorContext),
      getRequestSessionId(c as RequestActorContext),
      c.req.valid('param').organizationId,
      c.req.valid('json'),
      { requestId: c.req.header('x-request-id'), userAgent: c.req.header('user-agent') }
    )
    if (!result.ok) {
      const error = toErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{organizationId}/members/me/local-credential',
    tags: ['Organization Local Credentials'],
    description:
      '本人のLocal Credentialを無効化する。current passwordまたは最近のMembership認証を要求する',
    request: {
      params: organizationLocalCredentialParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: disableOrganizationLocalCredentialRequestSchema },
        },
      },
    },
    responses,
  })

  app.openapi(deleteRoute, async (c) => {
    const result = await disableMyOrganizationLocalCredential(
      requireRequestActor(c as RequestActorContext),
      getRequestSessionId(c as RequestActorContext),
      c.req.valid('param').organizationId,
      c.req.valid('json'),
      { requestId: c.req.header('x-request-id'), userAgent: c.req.header('user-agent') }
    )
    if (!result.ok) {
      const error = toErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
