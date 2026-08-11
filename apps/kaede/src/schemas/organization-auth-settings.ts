import { z } from '@hono/zod-openapi'
import { errorResponseSchema, isoDatetimeSchema, uuidSchema } from './common.js'

const positiveSecondsSchema = z.number().int().positive().max(2_147_483_647)

export const organizationAuthSettingsSchema = z
  .object({
    organization_id: uuidSchema,
    local_auth_enabled: z.boolean(),
    oidc_auth_enabled: z.boolean(),
    policy_version: z.number().int().positive(),
    membership_grant_ttl_seconds: positiveSecondsSchema,
    reauthentication_interval_seconds: positiveSecondsSchema,
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
  })
  .openapi('OrganizationAuthSettings')

export const updateOrganizationAuthSettingsRequestSchema = z
  .object({
    local_auth_enabled: z.boolean().optional(),
    oidc_auth_enabled: z.boolean().optional(),
    membership_grant_ttl_seconds: positiveSecondsSchema.optional(),
    reauthentication_interval_seconds: positiveSecondsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required')
  .openapi('UpdateOrganizationAuthSettingsRequest')

export const organizationAuthSettingsErrorCodeSchema = z.enum([
  'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND',
  'ORGANIZATION_AUTH_SETTINGS_INVALID',
  'OIDC_PROVIDER_REQUIRED',
])

export const organizationAuthSettingsErrorResponseSchema = errorResponseSchema
  .extend({
    error_code: organizationAuthSettingsErrorCodeSchema,
  })
  .openapi('OrganizationAuthSettingsErrorResponse')

export type UpdateOrganizationAuthSettingsRequest = z.infer<
  typeof updateOrganizationAuthSettingsRequestSchema
>
