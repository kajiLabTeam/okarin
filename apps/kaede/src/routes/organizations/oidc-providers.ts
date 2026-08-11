import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import { authOkResponseSchema } from '../../schemas/auth.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  createOrganizationOidcProviderRequestSchema,
  organizationOidcProviderParamsSchema,
  organizationOidcProviderSchema,
  organizationOidcProvidersResponseSchema,
  updateOrganizationOidcProviderRequestSchema,
} from '../../schemas/organization-oidc-auth.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import { requireActiveSessionUser } from '../../usecases/auth/index.js'
import {
  createOrganizationOidcProvider,
  disableOrganizationOidcProvider,
  getOrganizationOidcProviders,
  patchOrganizationOidcProvider,
} from '../../usecases/organization-oidc-auth/index.js'
import { getSessionTokenFromCookie } from '../auth/cookie.js'

const authErrorBody = {
  error_code: 'AUTH_UNAUTHENTICATED',
  error_message: 'login required',
} as const

export const registerOrganizationOidcProviderRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/oidc-providers',
    tags: ['Organization Auth'],
    request: { params: organizationIdParamsSchema },
    responses: {
      200: {
        description: 'OIDC providers',
        content: { 'application/json': { schema: organizationOidcProvidersResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'owner required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(listRoute, async (c) => {
    const actor = await requireActiveSessionUser(getSessionTokenFromCookie(c))
    if (!actor.ok) return c.json(authErrorBody, 401)
    const result = await getOrganizationOidcProviders(
      c.req.valid('param').organizationId,
      actor.value.id
    )
    if (!result.ok)
      return c.json(
        { error_code: result.error.type, error_message: 'owner permission is required' },
        403
      )
    return c.json(result.value, 200)
  })

  const createRouteDefinition = createRoute({
    method: 'post',
    path: '/{organizationId}/oidc-providers',
    tags: ['Organization Auth'],
    request: {
      params: organizationIdParamsSchema,
      body: {
        content: { 'application/json': { schema: createOrganizationOidcProviderRequestSchema } },
      },
    },
    responses: {
      201: {
        description: 'OIDC provider created',
        content: { 'application/json': { schema: organizationOidcProviderSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'owner required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      422: {
        description: 'invalid provider config',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(createRouteDefinition, async (c) => {
    const actor = await requireActiveSessionUser(getSessionTokenFromCookie(c))
    if (!actor.ok) return c.json(authErrorBody, 401)
    const config = getOidcRuntimeConfig()
    const result = await createOrganizationOidcProvider(
      c.req.valid('param').organizationId,
      actor.value.id,
      c.req.valid('json'),
      config.googleClientId
    )
    if (!result.ok) {
      if (result.error.type === 'OIDC_PROVIDER_CONFIG_INVALID') {
        return c.json(
          { error_code: result.error.type, error_message: 'OIDC provider config is invalid' },
          422
        )
      }
      return c.json(
        { error_code: result.error.type, error_message: 'owner permission is required' },
        403
      )
    }
    return c.json(result.value, 201)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/oidc-providers/{providerId}',
    tags: ['Organization Auth'],
    request: {
      params: organizationOidcProviderParamsSchema,
      body: {
        content: { 'application/json': { schema: updateOrganizationOidcProviderRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'OIDC provider updated',
        content: { 'application/json': { schema: organizationOidcProviderSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'owner required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'provider not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      422: {
        description: 'invalid provider config',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(patchRoute, async (c) => {
    const actor = await requireActiveSessionUser(getSessionTokenFromCookie(c))
    if (!actor.ok) return c.json(authErrorBody, 401)
    const params = c.req.valid('param')
    const result = await patchOrganizationOidcProvider(
      params.organizationId,
      params.providerId,
      actor.value.id,
      c.req.valid('json'),
      getOidcRuntimeConfig().googleClientId
    )
    if (!result.ok) {
      if (result.error.type === 'OIDC_PROVIDER_NOT_FOUND') {
        return c.json(
          { error_code: result.error.type, error_message: 'OIDC provider not found' },
          404
        )
      }
      if (result.error.type === 'OIDC_PROVIDER_CONFIG_INVALID') {
        return c.json(
          { error_code: result.error.type, error_message: 'OIDC provider config is invalid' },
          422
        )
      }
      return c.json(
        { error_code: result.error.type, error_message: 'owner permission is required' },
        403
      )
    }
    return c.json(result.value, 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{organizationId}/oidc-providers/{providerId}',
    tags: ['Organization Auth'],
    request: { params: organizationOidcProviderParamsSchema },
    responses: {
      200: {
        description: 'OIDC provider disabled',
        content: { 'application/json': { schema: authOkResponseSchema } },
      },
      401: {
        description: 'login required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'owner required',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'provider not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })
  app.openapi(deleteRoute, async (c) => {
    const actor = await requireActiveSessionUser(getSessionTokenFromCookie(c))
    if (!actor.ok) return c.json(authErrorBody, 401)
    const params = c.req.valid('param')
    const result = await disableOrganizationOidcProvider(
      params.organizationId,
      params.providerId,
      actor.value.id
    )
    if (!result.ok) {
      if (result.error.type === 'OIDC_PROVIDER_NOT_FOUND') {
        return c.json(
          { error_code: result.error.type, error_message: 'OIDC provider not found' },
          404
        )
      }
      return c.json(
        { error_code: result.error.type, error_message: 'owner permission is required' },
        403
      )
    }
    return c.json({ ok: true as const }, 200)
  })
}
