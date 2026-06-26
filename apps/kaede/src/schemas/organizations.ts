import { z } from '@hono/zod-openapi'
import { authUserSchema, loginRequestSchema } from './auth.js'
import { isoDatetimeSchema, membershipRoleSchema, uuidSchema } from './common.js'
import {
  createPedestrianWithoutOrganizationRequestSchema,
  pedestrianSchema,
} from './pedestrians.js'

export const organizationSchema = z.object({
  organization_id: uuidSchema,
  name: z.string().min(1).max(255),
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const organizationIdParamsSchema = z.object({
  organizationId: uuidSchema,
})

export const organizationUserParamsSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
})

export const organizationsResponseSchema = z.object({
  organizations: z.array(organizationSchema),
})

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(255),
})

export const organizationSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .refine(
    (slug) => !['admin', 'api', 'auth', 'platform', 'new', 'settings'].includes(slug),
    'reserved organization slug'
  )

export const organizationCreationRequestStatusSchema = z.enum(['pending', 'approved', 'rejected'])

export const organizationCreationRequestSchema = z.object({
  request_id: uuidSchema,
  requester_user_id: uuidSchema,
  requested_organization_name: z.string().min(1),
  requested_slug: organizationSlugSchema.nullable(),
  status: organizationCreationRequestStatusSchema,
  reviewed_by_user_id: uuidSchema.nullable(),
  reviewed_at: isoDatetimeSchema.nullable(),
  rejected_reason: z.string().nullable(),
  created_organization_id: uuidSchema.nullable(),
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const organizationCreationRequestsResponseSchema = z.object({
  requests: z.array(organizationCreationRequestSchema),
})

export const createOrganizationCreationRequestRequestSchema = z.object({
  organization_name: z.string().min(1).max(255),
  requested_slug: organizationSlugSchema.nullable().optional(),
})

export const organizationCreationRequestIdParamsSchema = z.object({
  requestId: uuidSchema,
})

export const approveOrganizationCreationRequestRequestSchema = z.object({
  slug: organizationSlugSchema,
})

export const rejectOrganizationCreationRequestRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
})

export const organizationUserSchema = z.object({
  user_id: authUserSchema.shape.user_id,
  email: authUserSchema.shape.email,
  display_name: authUserSchema.shape.display_name,
  status: authUserSchema.shape.status,
  role: membershipRoleSchema,
  password_changed_at: authUserSchema.shape.password_changed_at,
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
export type ApproveOrganizationCreationRequestRequest = z.infer<
  typeof approveOrganizationCreationRequestRequestSchema
>
export type CreateOrganizationCreationRequestRequest = z.infer<
  typeof createOrganizationCreationRequestRequestSchema
>
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>
export type CreateOrganizationUserRequest = z.infer<typeof createOrganizationUserRequestSchema>
export type MembershipRole = z.infer<typeof membershipRoleSchema>
export type OrganizationCreationRequestIdParams = z.infer<
  typeof organizationCreationRequestIdParamsSchema
>
export type OrganizationCreationRequestResponse = z.infer<typeof organizationCreationRequestSchema>
export type OrganizationCreationRequestsResponse = z.infer<
  typeof organizationCreationRequestsResponseSchema
>
export type OrganizationIdParams = z.infer<typeof organizationIdParamsSchema>
export type OrganizationResponse = z.infer<typeof organizationSchema>
export type OrganizationUserParams = z.infer<typeof organizationUserParamsSchema>
export type OrganizationUserResponse = z.infer<typeof organizationUserSchema>
export type OrganizationUsersResponse = z.infer<typeof organizationUsersResponseSchema>
export type OrganizationsResponse = z.infer<typeof organizationsResponseSchema>
export type RejectOrganizationCreationRequestRequest = z.infer<
  typeof rejectOrganizationCreationRequestRequestSchema
>
