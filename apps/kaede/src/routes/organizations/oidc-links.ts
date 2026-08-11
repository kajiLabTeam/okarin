import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { authOkResponseSchema } from '../../schemas/auth.js'
import { authErrorResponseSchema } from '../../schemas/common.js'
import {
  organizationOidcLinkErrorResponseSchema,
  organizationOidcLinkParamsSchema,
  organizationOidcLinksResponseSchema,
} from '../../schemas/organization-oidc-links.js'
import { organizationIdParamsSchema } from '../../schemas/organizations.js'
import {
  getMyOrganizationOidcLinks,
  unlinkMyOrganizationOidcIdentity,
} from '../../usecases/organization-oidc-links/index.js'

const authErrors = {
  401: {
    description: 'login required',
    content: { 'application/json': { schema: authErrorResponseSchema } },
  },
  403: {
    description: 'active membership and grant required',
    content: { 'application/json': { schema: authErrorResponseSchema } },
  },
} as const

export const registerOrganizationOidcLinkRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/members/me/oidc-links',
    tags: ['Organization OIDC Links'],
    description: '本人Membershipのactive OIDC LinkとProvider表示情報を取得する',
    request: { params: organizationIdParamsSchema },
    responses: {
      200: {
        description: 'active OIDC links',
        content: { 'application/json': { schema: organizationOidcLinksResponseSchema } },
      },
      401: authErrors[401],
      403: authErrors[403],
    },
  })

  app.openapi(listRoute, async (c) => {
    const result = await getMyOrganizationOidcLinks(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId
    )
    if (!result.ok) {
      return c.json(
        {
          error_code: 'AUTH_ORGANIZATION_FORBIDDEN' as const,
          error_message: 'organization membership access is required',
        },
        403
      )
    }
    return c.json(result.value, 200)
  })

  const unlinkRoute = createRoute({
    method: 'delete',
    path: '/{organizationId}/members/me/oidc-links/{linkId}',
    tags: ['Organization OIDC Links'],
    description:
      '本人がOIDC Linkを明示的にunlinkする。canonical Identityは維持し、対象Link由来のGrantだけをrevokeする',
    request: { params: organizationOidcLinkParamsSchema },
    responses: {
      200: {
        description: 'OIDC link unlinked',
        content: { 'application/json': { schema: authOkResponseSchema } },
      },
      401: authErrors[401],
      403: authErrors[403],
      404: {
        description: 'active OIDC link not found',
        content: { 'application/json': { schema: organizationOidcLinkErrorResponseSchema } },
      },
      409: {
        description: 'unlink would remove the last usable authentication method',
        content: { 'application/json': { schema: organizationOidcLinkErrorResponseSchema } },
      },
    },
  })

  app.openapi(unlinkRoute, async (c) => {
    const { organizationId, linkId } = c.req.valid('param')
    const result = await unlinkMyOrganizationOidcIdentity(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      linkId
    )
    if (!result.ok) {
      if (result.error.type === 'AUTH_ORGANIZATION_FORBIDDEN') {
        return c.json(
          {
            error_code: result.error.type,
            error_message: 'organization membership access is required',
          },
          403
        )
      }
      if (result.error.type === 'OIDC_MEMBERSHIP_LINK_NOT_FOUND') {
        return c.json(
          { error_code: result.error.type, error_message: 'active OIDC link not found' },
          404
        )
      }
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'the last usable authentication method cannot be removed',
        },
        409
      )
    }
    return c.json(result.value, 200)
  })
}
