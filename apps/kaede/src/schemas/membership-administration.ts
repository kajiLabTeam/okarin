import { z } from '@hono/zod-openapi'
import { membershipRoleSchema, uuidSchema } from './common.js'

export const membershipAdministrationParamsSchema = z
  .object({ organizationId: uuidSchema, membershipId: uuidSchema })
  .openapi('MembershipAdministrationParams')

export const updateMembershipRequestSchema = z
  .object({
    role: membershipRoleSchema.optional(),
    status: z.enum(['active', 'suspended', 'left']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required')
  .openapi('UpdateMembershipRequest')

export const managedMembershipSchema = z
  .object({
    id: uuidSchema,
    organization_id: uuidSchema,
    user_id: uuidSchema,
    role: membershipRoleSchema,
    status: z.enum(['active', 'suspended', 'left']),
    joined_at: z.string().datetime(),
    left_at: z.string().datetime().nullable(),
    updated_at: z.string().datetime(),
  })
  .openapi('ManagedMembership')

export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>
