import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'
import { organizationIdParamsSchema, organizationSlugSchema } from './organizations.js'

const safeReturnToSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'),
    'return_to must be a safe application-relative path'
  )

export const oidcIntentSchema = z.enum([
  'login',
  'reauthenticate',
  'accept_invite',
  'link_identity',
])

export const organizationOidcStartParamsSchema = z.object({
  organizationSlug: organizationSlugSchema,
  providerId: uuidSchema,
})

export const organizationOidcStartRequestSchema = z
  .object({
    intent: oidcIntentSchema,
    return_to: safeReturnToSchema.optional(),
    mobile: z
      .object({
        redirect_uri: z.string().url(),
        code_challenge: z
          .string()
          .length(43)
          .regex(/^[A-Za-z0-9_-]+$/),
        code_challenge_method: z.literal('S256'),
      })
      .optional(),
    invite_token: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.intent === 'accept_invite' && !value.invite_token) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invite_token is required for accept_invite',
        path: ['invite_token'],
      })
    }
    if (value.intent !== 'accept_invite' && value.invite_token) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invite_token is only allowed for accept_invite',
        path: ['invite_token'],
      })
    }
    const isMobileIntent = value.intent === 'login' || value.intent === 'reauthenticate'
    if (isMobileIntent && !value.return_to && !value.mobile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'return_to or mobile is required',
        path: ['return_to'],
      })
    }
    if (value.mobile && !isMobileIntent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mobile is only allowed for login or reauthenticate',
        path: ['mobile'],
      })
    }
    if (value.mobile && value.return_to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'return_to cannot be combined with mobile',
        path: ['return_to'],
      })
    }
  })

export const organizationOidcStartResponseSchema = z.object({
  authorization_url: z.string().url(),
})

const hostedDomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/)

export const createOrganizationOidcProviderRequestSchema = z.object({
  display_name: z.string().trim().min(1).max(255),
  issuer: z.enum(['accounts.google.com', 'https://accounts.google.com']),
  client_id: z.string().trim().min(1).max(2048),
  allowed_hosted_domains: z.array(hostedDomainSchema).max(100).nullable().optional(),
  enabled: z.boolean().default(true),
})

export const updateOrganizationOidcProviderRequestSchema =
  createOrganizationOidcProviderRequestSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'at least one field is required')

export const organizationOidcProviderSchema = z.object({
  id: uuidSchema,
  organization_id: uuidSchema,
  display_name: z.string(),
  issuer: z.string(),
  client_id: z.string(),
  allowed_hosted_domains: z.array(z.string()).nullable(),
  enabled: z.boolean(),
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const organizationOidcProvidersResponseSchema = z.object({
  providers: z.array(organizationOidcProviderSchema),
})

export const organizationOidcProviderParamsSchema = organizationIdParamsSchema.extend({
  providerId: uuidSchema,
})

export type CreateOrganizationOidcProviderRequest = z.infer<
  typeof createOrganizationOidcProviderRequestSchema
>
export type OrganizationOidcStartRequest = z.infer<typeof organizationOidcStartRequestSchema>
export type OidcIntent = z.infer<typeof oidcIntentSchema>
export type UpdateOrganizationOidcProviderRequest = z.infer<
  typeof updateOrganizationOidcProviderRequestSchema
>
