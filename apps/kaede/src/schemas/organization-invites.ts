import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'
import { organizationSlugSchema } from './organizations.js'
import { displayNameSchema, localeSchema, timezoneSchema } from './profiles.js'

export const inviteRoleSchema = z.enum(['member', 'manager'])
export const inviteStatusSchema = z.enum(['active', 'redeemed', 'revoked', 'expired'])

export const organizationInviteParamsSchema = z.object({
  organizationId: uuidSchema,
  inviteId: uuidSchema,
})

export const organizationInvitesParamsSchema = z.object({ organizationId: uuidSchema })

export const createOrganizationInviteRequestSchema = z.object({ role: inviteRoleSchema })

export const organizationInviteTokenResponseSchema = z
  .object({
    token: z.string().min(1),
    expires_at: isoDatetimeSchema,
  })
  .openapi('OrganizationInviteTokenResponse')

export const organizationInviteSchema = z.object({
  id: uuidSchema,
  role: inviteRoleSchema,
  status: inviteStatusSchema,
  expires_at: isoDatetimeSchema,
  created_at: isoDatetimeSchema,
})

export const organizationInvitesResponseSchema = z
  .object({ invites: z.array(organizationInviteSchema) })
  .openapi('OrganizationInvitesResponse')

export const verifyOrganizationInviteRequestSchema = z.object({
  token: z.string().min(1).max(512),
})

export const verifyOrganizationInviteResponseSchema = z
  .object({
    organization: z.object({
      id: uuidSchema,
      name: z.string().min(1),
      slug: organizationSlugSchema,
    }),
    role: inviteRoleSchema,
    expires_at: isoDatetimeSchema,
    authentication_methods: z.object({
      local: z.boolean(),
      oidc: z.boolean(),
    }),
    oidc_providers: z.array(
      z.object({
        id: uuidSchema,
        display_name: z.string().min(1).max(255),
      })
    ),
  })
  .openapi('VerifyOrganizationInviteResponse')

const newUserProfileSchema = z.object({
  display_name: displayNameSchema,
  locale: localeSchema,
  timezone: timezoneSchema,
})

export const acceptLocalOrganizationInviteRequestSchema = z.object({
  token: z.string().min(1).max(512),
  login_email: z.string().trim().email().max(255),
  password: z.string().min(8).max(100),
  contact_email: z.string().trim().email().max(255).optional(),
  profile: newUserProfileSchema.optional(),
})

export const acceptLocalOrganizationInviteResponseSchema = z
  .object({
    session: z.object({ expires_at: isoDatetimeSchema }),
    membership: z.object({
      id: uuidSchema,
      organization_id: uuidSchema,
      role: inviteRoleSchema,
      status: z.literal('active'),
    }),
    grant: z.object({
      auth_method: z.literal('local'),
      authenticated_at: isoDatetimeSchema,
      expires_at: isoDatetimeSchema,
    }),
  })
  .openapi('AcceptLocalOrganizationInviteResponse')

export type InviteRole = z.infer<typeof inviteRoleSchema>
export type CreateOrganizationInviteRequest = z.infer<typeof createOrganizationInviteRequestSchema>
export type AcceptLocalOrganizationInviteRequest = z.infer<
  typeof acceptLocalOrganizationInviteRequestSchema
>
