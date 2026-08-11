import { z } from '@hono/zod-openapi'
import {
  accountStateSchema,
  isoDatetimeSchema,
  membershipRoleSchema,
  userStatusSchema,
  uuidSchema,
} from './common.js'

export const authMembershipSchema = z
  .object({
    organization_id: uuidSchema,
    organization_name: z.string().min(1).max(255),
    role: membershipRoleSchema,
    grant_state: z
      .discriminatedUnion('status', [
        z.object({
          status: z.literal('granted'),
          auth_method: z.enum(['local', 'oidc']),
          authenticated_at: isoDatetimeSchema,
          expires_at: isoDatetimeSchema,
        }),
        z.object({
          status: z.literal('reauthentication_required'),
          reason: z.enum([
            'grant_missing',
            'grant_revoked',
            'grant_expired',
            'reauthentication_interval_elapsed',
            'policy_changed',
            'auth_method_not_allowed',
          ]),
          allowed_auth_methods: z.array(z.enum(['local', 'oidc'])),
        }),
        z.object({
          status: z.literal('forbidden'),
        }),
      ])
      .optional(),
  })
  .openapi('AuthMembership')

const authUserBaseShape = {
  user_id: uuidSchema,
  email: z.string().email().max(255),
  display_name: z.string().min(1).max(255),
  global_role: z.enum(['none', 'admin']),
  status: userStatusSchema,
  account_state: accountStateSchema,
  password_changed_at: isoDatetimeSchema.nullable(),
}

export const authUserSchema = z
  .object({
    ...authUserBaseShape,
    memberships: z.array(authMembershipSchema),
  })
  .openapi('AuthUser')

export const loginRequestSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(100),
  })
  .openapi('LoginRequest')

export const authUserResponseSchema = z
  .object({
    session_auth_method: z.enum(['password', 'oidc']),
    user: authUserSchema,
  })
  .openapi('AuthUserResponse')

export const authMeGrantStateSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('granted'),
      reason: z.null(),
      auth_method: z.enum(['local', 'oidc']),
      authenticated_at: isoDatetimeSchema,
      reauthentication_required_at: isoDatetimeSchema,
      expires_at: isoDatetimeSchema,
      effective_expires_at: isoDatetimeSchema,
    }),
    z.object({
      status: z.literal('reauthentication_required'),
      reason: z.enum([
        'grant_missing',
        'grant_revoked',
        'grant_expired',
        'reauthentication_interval_elapsed',
        'policy_changed',
        'auth_method_not_allowed',
      ]),
      auth_method: z.enum(['local', 'oidc']).nullable(),
      authenticated_at: isoDatetimeSchema.nullable(),
      reauthentication_required_at: isoDatetimeSchema.nullable(),
      expires_at: isoDatetimeSchema.nullable(),
      effective_expires_at: isoDatetimeSchema.nullable(),
    }),
    z.object({
      status: z.literal('forbidden'),
      reason: z.enum([
        'membership_suspended',
        'organization_unavailable',
        'auth_settings_unavailable',
      ]),
      auth_method: z.null(),
      authenticated_at: z.null(),
      reauthentication_required_at: z.null(),
      expires_at: z.null(),
      effective_expires_at: z.null(),
    }),
  ])
  .openapi('AuthMeGrantState')

export const authMeMembershipSchema = z
  .object({
    membership_id: uuidSchema,
    organization_id: uuidSchema,
    organization_name: z.string().min(1).max(255),
    organization_slug: z.string().min(1).max(63),
    role: membershipRoleSchema,
    status: z.enum(['active', 'suspended']),
    allowed_auth_methods: z.array(z.enum(['local', 'oidc'])),
    grant_state: authMeGrantStateSchema,
  })
  .openapi('AuthMeMembership')

export const authMeUserSchema = z
  .object({
    ...authUserBaseShape,
    memberships: z.array(authMeMembershipSchema),
  })
  .openapi('AuthMeUser')

export const authMeResponseSchema = z
  .object({
    session_auth_method: authUserResponseSchema.shape.session_auth_method,
    user: authMeUserSchema,
  })
  .openapi('AuthMeResponse')

export const changePasswordRequestSchema = z
  .object({
    current_password: z.string().min(1).max(100),
    new_password: z.string().min(1).max(100),
  })
  .openapi('ChangePasswordRequest')

export const activationVerifyRequestSchema = z
  .object({
    token: z.string().min(1),
  })
  .openapi('ActivationVerifyRequest')

export const activationVerifyResponseSchema = z
  .discriminatedUnion('valid', [
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
  .openapi('ActivationVerifyResponse')

export const activationCompleteRequestSchema = z
  .object({
    token: activationVerifyRequestSchema.shape.token,
    password: loginRequestSchema.shape.password,
  })
  .openapi('ActivationCompleteRequest')

export const authOkResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .openapi('AuthOkResponse')

export type ActivationCompleteRequest = z.infer<typeof activationCompleteRequestSchema>
export type ActivationVerifyRequest = z.infer<typeof activationVerifyRequestSchema>
export type ActivationVerifyResponse = z.infer<typeof activationVerifyResponseSchema>
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
