import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { authErrorResponseSchema, errorResponseSchema } from '../../schemas/common.js'
import {
  organizationAuthSettingsErrorResponseSchema,
  organizationAuthSettingsSchema,
  updateOrganizationAuthSettingsRequestSchema,
} from '../../schemas/organization-auth-settings.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  getOrganizationAuthSettings,
  patchOrganizationAuthSettings,
} from '../../usecases/organization-auth-settings/index.js'

const commonErrorResponses = {
  401: {
    description: 'login required',
    content: { 'application/json': { schema: authErrorResponseSchema } },
  },
  403: {
    description: 'active owner required',
    content: { 'application/json': { schema: authErrorResponseSchema } },
  },
  404: {
    description: 'auth settings not found',
    content: { 'application/json': { schema: organizationAuthSettingsErrorResponseSchema } },
  },
} as const

export const registerOrganizationAuthSettingsRoutes = (app: OpenAPIHono) => {
  const getRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/auth-settings',
    tags: ['Organization Auth'],
    description: 'active ownerがOrganizationの認証Policyを取得する',
    request: { params: organizationIdParamsSchema },
    responses: {
      200: {
        description: 'organization auth settings',
        content: { 'application/json': { schema: organizationAuthSettingsSchema } },
      },
      401: commonErrorResponses[401],
      403: commonErrorResponses[403],
      404: commonErrorResponses[404],
    },
  })

  app.openapi(getRoute, async (c) => {
    const result = await getOrganizationAuthSettings(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId
    )
    if (!result.ok) {
      if (result.error.type === 'AUTH_DASHBOARD_FORBIDDEN') {
        return c.json(
          { error_code: result.error.type, error_message: 'active owner permission is required' },
          403
        )
      }
      return c.json(
        {
          error_code: 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND' as const,
          error_message: 'organization auth settings not found',
        },
        404
      )
    }
    return c.json(result.value, 200)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/auth-settings',
    tags: ['Organization Auth'],
    description: 'active ownerが認証Policyを部分更新する。実質変更時だけpolicy_versionを増加させる',
    request: {
      params: organizationIdParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateOrganizationAuthSettingsRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'updated organization auth settings',
        content: { 'application/json': { schema: organizationAuthSettingsSchema } },
      },
      400: {
        description: 'request validation failed',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: commonErrorResponses[401],
      403: commonErrorResponses[403],
      404: commonErrorResponses[404],
      422: {
        description: 'policy invariant violation',
        content: { 'application/json': { schema: organizationAuthSettingsErrorResponseSchema } },
      },
    },
  })

  app.openapi(patchRoute, async (c) => {
    const result = await patchOrganizationAuthSettings(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId,
      c.req.valid('json')
    )
    if (!result.ok) {
      if (result.error.type === 'AUTH_DASHBOARD_FORBIDDEN') {
        return c.json(
          { error_code: result.error.type, error_message: 'active owner permission is required' },
          403
        )
      }
      if (result.error.type === 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND') {
        return c.json(
          { error_code: result.error.type, error_message: 'organization auth settings not found' },
          404
        )
      }
      if (result.error.type === 'OIDC_PROVIDER_REQUIRED') {
        return c.json(
          {
            error_code: result.error.type,
            error_message: 'an enabled OIDC provider is required before enabling OIDC',
          },
          422
        )
      }
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'organization auth settings are invalid',
        },
        422
      )
    }
    return c.json(result.value, 200)
  })
}
