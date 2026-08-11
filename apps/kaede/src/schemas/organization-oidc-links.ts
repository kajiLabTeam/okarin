import { z } from '@hono/zod-openapi'
import { errorResponseSchema, isoDatetimeSchema, uuidSchema } from './common.js'
import { organizationIdParamsSchema } from './organizations.js'

export const organizationOidcLinkSchema = z
  .object({
    id: uuidSchema,
    provider: z.object({
      id: uuidSchema,
      display_name: z.string().min(1),
      enabled: z.boolean(),
    }),
    linked_at: isoDatetimeSchema,
  })
  .openapi('OrganizationOidcLink')

export const organizationOidcLinksResponseSchema = z
  .object({ links: z.array(organizationOidcLinkSchema) })
  .openapi('OrganizationOidcLinksResponse')

export const organizationOidcLinkParamsSchema = organizationIdParamsSchema.extend({
  linkId: uuidSchema,
})

export const organizationOidcLinkErrorCodeSchema = z.enum([
  'OIDC_MEMBERSHIP_LINK_NOT_FOUND',
  'OIDC_LINK_LAST_USABLE_AUTH_METHOD',
])

export const organizationOidcLinkErrorResponseSchema = errorResponseSchema
  .extend({ error_code: organizationOidcLinkErrorCodeSchema })
  .openapi('OrganizationOidcLinkErrorResponse')
