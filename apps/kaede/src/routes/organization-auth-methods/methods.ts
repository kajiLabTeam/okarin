import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import {
  organizationAuthMethodsParamsSchema,
  organizationAuthMethodsResponseSchema,
} from '../../schemas/organization-auth-methods.js'
import { getPublicOrganizationAuthMethods } from '../../usecases/organization-auth-methods/index.js'

export const registerOrganizationAuthMethodsRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/{organizationSlug}/auth/methods',
    tags: ['Organization Auth'],
    description: '認証前または再認証時に利用可能な最小限のOrganization認証方式を返す',
    request: { params: organizationAuthMethodsParamsSchema },
    responses: {
      200: {
        description: 'public organization authentication methods',
        content: { 'application/json': { schema: organizationAuthMethodsResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const response = await getPublicOrganizationAuthMethods(c.req.valid('param').organizationSlug)
    c.header('Cache-Control', 'no-store')
    return c.json(response, 200)
  })
}
