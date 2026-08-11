import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'

export const organizationLocalCredentialParamsSchema = z
  .object({ organizationId: uuidSchema })
  .openapi('OrganizationLocalCredentialParams')

const passwordSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => value.trim().length > 0, 'password must not be blank')

export const organizationLocalCredentialSchema = z
  .discriminatedUnion('configured', [
    z.object({
      organization_id: uuidSchema,
      membership_id: uuidSchema,
      configured: z.literal(false),
    }),
    z.object({
      organization_id: uuidSchema,
      membership_id: uuidSchema,
      configured: z.literal(true),
      login_email: z.string().email().max(255),
      enabled: z.boolean(),
      password_changed_at: isoDatetimeSchema,
      updated_at: isoDatetimeSchema,
    }),
  ])
  .openapi('OrganizationLocalCredential')

export const putOrganizationLocalCredentialRequestSchema = z
  .object({
    login_email: z.string().email().max(255),
    new_password: passwordSchema,
    current_password: passwordSchema.optional(),
  })
  .openapi('PutOrganizationLocalCredentialRequest')

export const disableOrganizationLocalCredentialRequestSchema = z
  .object({ current_password: passwordSchema.optional() })
  .openapi('DisableOrganizationLocalCredentialRequest')

export type PutOrganizationLocalCredentialRequest = z.infer<
  typeof putOrganizationLocalCredentialRequestSchema
>
export type DisableOrganizationLocalCredentialRequest = z.infer<
  typeof disableOrganizationLocalCredentialRequestSchema
>
