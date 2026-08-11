import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationOidcStartParamsSchema,
  organizationOidcStartRequestSchema,
  organizationOidcStartResponseSchema,
} from '../../schemas/organization-oidc-auth.js'
import { GoogleOidcClient } from '../../services/auth/index.js'
import { startOrganizationOidc } from '../../usecases/organization-oidc-auth/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'

const errorStatus = (type: string) => {
  if (type === 'INVITE_INVALID' || type === 'OIDC_PROVIDER_NOT_FOUND') return 404 as const
  if (type === 'AUTH_SESSION_REQUIRED' || type.includes('SESSION_')) return 401 as const
  return 403 as const
}

export const registerOrganizationOidcStartRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{organizationSlug}/auth/oidc/{providerId}/start',
    tags: ['Organization Auth'],
    request: {
      params: organizationOidcStartParamsSchema,
      body: { content: { 'application/json': { schema: organizationOidcStartRequestSchema } } },
    },
    responses: {
      200: {
        description: 'authorization transaction created',
        content: { 'application/json': { schema: organizationOidcStartResponseSchema } },
      },
      401: {
        description: 'session required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'OIDC not allowed',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'provider or invite not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const config = getOidcRuntimeConfig()
    if (!config.enabled) {
      return c.json(
        { error_code: 'AUTH_METHOD_NOT_ALLOWED', error_message: 'OIDC is disabled' },
        403
      )
    }
    const { organizationSlug, providerId } = c.req.valid('param')
    const client = new GoogleOidcClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    })
    const result = await startOrganizationOidc(
      organizationSlug,
      providerId,
      getSessionTokenFromCookie(c),
      c.req.valid('json'),
      {
        client,
        configuredClientId: config.googleClientId,
        transactionSecret: config.stateCookieSecret,
      }
    )
    if (!result.ok) {
      const status = errorStatus(result.error.type)
      return c.json(
        { error_code: result.error.type, error_message: 'OIDC authorization could not start' },
        status
      )
    }

    return c.json(result.value, 200)
  })
}
