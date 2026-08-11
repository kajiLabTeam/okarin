import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'

export const displayNameSchema = z.string().trim().min(1).max(255)

export const localeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.Locale(value)
      return true
    } catch {
      return false
    }
  }, 'locale must be a valid BCP 47 language tag')

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'timezone must be a valid IANA time zone')

const heightMetersSchema = z.number().positive().max(3).nullable().openapi({
  description: 'Organization内プロフィールで使用する身長（メートル）',
  example: 1.705,
})

const strideLengthMetersSchema = z.number().positive().max(3).nullable().openapi({
  description: 'Organization内プロフィールで使用する歩幅（メートル）',
  example: 0.72,
})

export const userProfileSchema = z
  .object({
    user_id: uuidSchema,
    display_name: displayNameSchema,
    locale: localeSchema,
    timezone: timezoneSchema,
    updated_at: isoDatetimeSchema,
  })
  .openapi('UserProfile')

export const updateUserProfileRequestSchema = z
  .object({
    display_name: displayNameSchema.optional(),
    locale: localeSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, 'at least one field is required')
  .openapi('UpdateUserProfileRequest')

export const organizationMemberProfileSchema = z
  .object({
    organization_id: uuidSchema,
    membership_id: uuidSchema,
    global: z.object({
      display_name: displayNameSchema,
    }),
    override: z.object({
      display_name: displayNameSchema.nullable(),
      height_meters: heightMetersSchema,
      stride_length_meters: strideLengthMetersSchema,
    }),
    effective: z.object({
      display_name: displayNameSchema,
      display_name_source: z.enum(['global', 'organization_override']),
    }),
    updated_at: isoDatetimeSchema.nullable(),
  })
  .openapi('OrganizationMemberProfile')

export const organizationMemberProfileUpdateResponseSchema = organizationMemberProfileSchema
  .extend({
    update_context: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('self') }),
      z.object({
        kind: z.literal('forced'),
        actor_role: z.enum(['manager', 'owner', 'global_admin']),
      }),
    ]),
  })
  .openapi('OrganizationMemberProfileUpdateResponse')

export const updateOrganizationMemberProfileRequestSchema = z
  .object({
    display_name: displayNameSchema.nullable().optional(),
    height_meters: heightMetersSchema.optional(),
    stride_length_meters: strideLengthMetersSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, 'at least one field is required')
  .openapi('UpdateOrganizationMemberProfileRequest')

export const organizationMemberProfileParamsSchema = z.object({
  organizationId: uuidSchema,
  membershipId: uuidSchema,
})

export const organizationProfileParamsSchema = z.object({
  organizationId: uuidSchema,
})

export type UserProfileResponse = z.infer<typeof userProfileSchema>
export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileRequestSchema>
export type OrganizationMemberProfileResponse = z.infer<typeof organizationMemberProfileSchema>
export type OrganizationMemberProfileUpdateResponse = z.infer<
  typeof organizationMemberProfileUpdateResponseSchema
>
export type UpdateOrganizationMemberProfileRequest = z.infer<
  typeof updateOrganizationMemberProfileRequestSchema
>
