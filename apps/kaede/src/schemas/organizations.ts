import { z } from '@hono/zod-openapi'
import { authUserSchema, loginRequestSchema } from './auth.js'
import { isoDatetimeSchema, uuidSchema } from './common.js'
import {
  createPedestrianWithoutOrganizationRequestSchema,
  pedestrianSchema,
} from './pedestrians.js'

export const membershipRoleSchema = z.enum(['member', 'manager'])

export const organizationSchema = z.object({
  organization_id: uuidSchema,
  name: z.string().min(1).max(255),
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const organizationIdParamsSchema = z.object({
  organizationId: uuidSchema,
})

export const organizationsResponseSchema = z.object({
  organizations: z.array(organizationSchema),
})

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(255),
})

export const organizationUserSchema = authUserSchema
  .omit({
    global_role: true,
    memberships: true,
  })
  .extend({
    is_active: z.boolean(),
    role: membershipRoleSchema,
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
    pedestrian: pedestrianSchema.nullable(),
  })

export const organizationUsersResponseSchema = z.object({
  users: z.array(organizationUserSchema),
})

export const createOrganizationUserRequestSchema = z
  .object({
    email: loginRequestSchema.shape.email,
    display_name: authUserSchema.shape.display_name,
    role: membershipRoleSchema,
    temporary_password: loginRequestSchema.shape.password,
    create_pedestrian: z.boolean().default(false),
    pedestrian: createPedestrianWithoutOrganizationRequestSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.create_pedestrian && !payload.pedestrian) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pedestrian is required when create_pedestrian is true',
        path: ['pedestrian'],
      })
    }
  })

export const createOrganizationMembershipRequestSchema = z.object({
  user_id: uuidSchema,
  role: membershipRoleSchema,
})

export type CreateOrganizationMembershipRequest = z.infer<
  typeof createOrganizationMembershipRequestSchema
>
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>
export type CreateOrganizationUserRequest = z.infer<typeof createOrganizationUserRequestSchema>
export type MembershipRole = z.infer<typeof membershipRoleSchema>
export type OrganizationIdParams = z.infer<typeof organizationIdParamsSchema>
export type OrganizationResponse = z.infer<typeof organizationSchema>
export type OrganizationUserResponse = z.infer<typeof organizationUserSchema>
export type OrganizationUsersResponse = z.infer<typeof organizationUsersResponseSchema>
export type OrganizationsResponse = z.infer<typeof organizationsResponseSchema>
