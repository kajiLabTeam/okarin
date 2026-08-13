import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, membershipRoleSchema, uuidSchema } from './common.js'
import { organizationSlugSchema } from './organizations.js'

const safeReturnToSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'),
    'return_to must be a safe application-relative path'
  )

export const organizationLocalAuthParamsSchema = z
  .object({ organizationSlug: organizationSlugSchema })
  .openapi('OrganizationLocalAuthParams')

export const localOrganizationLoginRequestSchema = z
  .object({
    intent: z.enum(['login', 'reauthenticate']).optional(),
    login_email: z.string().email().max(255),
    password: z.string().min(1).max(100),
    return_to: safeReturnToSchema.optional(),
  })
  .openapi('LocalOrganizationLoginRequest')

export const localOrganizationLoginResponseSchema = z
  .object({
    session: z.object({ expires_at: isoDatetimeSchema }),
    membership: z.object({
      id: uuidSchema,
      organization_id: uuidSchema,
      role: membershipRoleSchema,
      status: z.literal('active'),
    }),
    grant: z.object({
      auth_method: z.literal('local'),
      authenticated_at: isoDatetimeSchema,
      expires_at: isoDatetimeSchema,
    }),
    return_to: safeReturnToSchema,
  })
  .openapi('LocalOrganizationLoginResponse')

export type LocalOrganizationLoginRequest = z.infer<typeof localOrganizationLoginRequestSchema>
