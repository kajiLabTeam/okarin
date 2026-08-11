import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'
import { organizationSlugSchema } from './organizations.js'

export const organizationAuthMethodsParamsSchema = z.object({
  organizationSlug: organizationSlugSchema,
})

export const organizationAuthMethodsResponseSchema = z
  .object({
    local_auth_enabled: z.boolean(),
    allowed_auth_methods: z.array(z.enum(['local', 'oidc'])),
    oidc_providers: z.array(
      z.object({
        id: uuidSchema,
        display_name: z.string().min(1).max(255),
      })
    ),
  })
  .openapi('OrganizationAuthMethodsResponse')

export type OrganizationAuthMethodsResponse = z.infer<typeof organizationAuthMethodsResponseSchema>
