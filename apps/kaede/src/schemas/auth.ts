import { z } from '@hono/zod-openapi'
import {
  accountStateSchema,
  isoDatetimeSchema,
  membershipRoleSchema,
  userStatusSchema,
  uuidSchema,
} from './common.js'

export const authMembershipSchema = z.object({
  organization_id: uuidSchema,
  organization_name: z.string().min(1).max(255),
  role: membershipRoleSchema,
})

export const authUserSchema = z.object({
  user_id: uuidSchema,
  email: z.string().email().max(255),
  display_name: z.string().min(1).max(255),
  global_role: z.enum(['none', 'admin']),
  status: userStatusSchema,
  account_state: accountStateSchema,
  password_changed_at: isoDatetimeSchema.nullable(),
  memberships: z.array(authMembershipSchema),
})

export const loginRequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
})

export const authUserResponseSchema = z.object({
  session_auth_method: z.enum(['password', 'oidc']),
  user: authUserSchema,
})

export const changePasswordRequestSchema = z.object({
  current_password: z.string().min(1).max(100),
  new_password: z.string().min(1).max(100),
})

export const activationVerifyRequestSchema = z.object({
  token: z.string().min(1),
})

export const activationVerifyResponseSchema = z.discriminatedUnion('valid', [
  z.object({
    valid: z.literal(false),
  }),
  z.object({
    valid: z.literal(true),
    email: authUserSchema.shape.email,
    display_name: authUserSchema.shape.display_name,
    organization_name: z.string().min(1).max(255),
    expires_at: isoDatetimeSchema,
  }),
])

export const activationCompleteRequestSchema = z.object({
  token: activationVerifyRequestSchema.shape.token,
  password: loginRequestSchema.shape.password,
})

export const authOkResponseSchema = z.object({
  ok: z.literal(true),
})

export type ActivationCompleteRequest = z.infer<typeof activationCompleteRequestSchema>
export type ActivationVerifyRequest = z.infer<typeof activationVerifyRequestSchema>
export type ActivationVerifyResponse = z.infer<typeof activationVerifyResponseSchema>
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
