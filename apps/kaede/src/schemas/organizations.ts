import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'

export const membershipRoleSchema = z.enum(['member', 'manager'])

export const organizationSchema = z.object({
  organization_id: uuidSchema,
  name: z.string().min(1).max(255),
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const organizationsResponseSchema = z.object({
  organizations: z.array(organizationSchema),
})

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(255),
})

export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>
export type MembershipRole = z.infer<typeof membershipRoleSchema>
export type OrganizationResponse = z.infer<typeof organizationSchema>
export type OrganizationsResponse = z.infer<typeof organizationsResponseSchema>
