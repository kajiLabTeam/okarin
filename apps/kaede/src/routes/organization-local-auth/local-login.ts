import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  localOrganizationLoginRequestSchema,
  localOrganizationLoginResponseSchema,
  organizationLocalAuthParamsSchema,
} from '../../schemas/organization-local-auth.js'
import { loginToOrganizationWithLocalCredential } from '../../usecases/organization-local-auth/index.js'
import { getSessionTokenFromCookie, setSessionCookie } from '../auth/cookie.js'

const localAuthError = (type: string) => {
  switch (type) {
    case 'AUTH_METHOD_NOT_ALLOWED':
      return {
        status: 403 as const,
        body: {
          error_code: type,
          error_message: 'local authentication is not allowed for this organization',
        },
      }
    case 'AUTH_IDENTITY_USER_MISMATCH':
      return {
        status: 403 as const,
        body: {
          error_code: type,
          error_message: 'the credential belongs to a different user',
        },
      }
    case 'AUTH_MEMBERSHIP_NOT_ACTIVE':
      return {
        status: 403 as const,
        body: { error_code: type, error_message: 'organization membership is not active' },
      }
    case 'AUTH_USER_DISABLED':
      return {
        status: 403 as const,
        body: { error_code: type, error_message: 'user is disabled' },
      }
    case 'AUTH_UNAUTHENTICATED':
      return {
        status: 401 as const,
        body: { error_code: type, error_message: 'login required' },
      }
    case 'AUTH_SESSION_ALREADY_EXISTS':
      return {
        status: 409 as const,
        body: { error_code: type, error_message: 'a valid session already exists' },
      }
    case 'AUTH_CREDENTIAL_LOCKED':
      return {
        status: 429 as const,
        body: { error_code: type, error_message: 'local credential is temporarily locked' },
      }
    case 'AUTH_SESSION_EXPIRED':
      return {
        status: 401 as const,
        body: { error_code: type, error_message: 'session expired' },
      }
    case 'AUTH_SESSION_REVOKED':
      return {
        status: 401 as const,
        body: { error_code: type, error_message: 'session revoked' },
      }
    default:
      return {
        status: 401 as const,
        body: {
          error_code: 'AUTH_INVALID_CREDENTIALS',
          error_message: 'invalid email or password',
        },
      }
  }
}

export const registerLocalOrganizationLoginRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationSlug}/auth/local/login',
    tags: ['Organization Auth'],
    description: 'Membership単位のLocal CredentialでOrganizationへ認証する',
    request: {
      params: organizationLocalAuthParamsSchema,
      body: {
        content: { 'application/json': { schema: localOrganizationLoginRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'local authentication succeeded',
        content: { 'application/json': { schema: localOrganizationLoginResponseSchema } },
      },
      401: {
        description: 'invalid credentials or session',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'a valid session already exists',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'local authentication is not allowed',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      429: {
        description: 'credential is locked',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const { organizationSlug } = c.req.valid('param')
    const result = await loginToOrganizationWithLocalCredential(
      organizationSlug,
      getSessionTokenFromCookie(c),
      c.req.valid('json'),
      {
        requestId: c.req.header('x-request-id'),
        userAgent: c.req.header('user-agent'),
      }
    )

    if (!result.ok) {
      const error = localAuthError(result.error.type)
      return c.json(error.body, error.status)
    }

    if (result.value.sessionToken) {
      setSessionCookie(c, result.value.sessionToken, result.value.session.expires_at)
    }

    return c.json(
      {
        session: { expires_at: result.value.session.expires_at },
        membership: result.value.membership,
        grant: result.value.grant,
        return_to: result.value.return_to,
      },
      200
    )
  })
}
