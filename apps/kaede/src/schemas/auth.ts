import { z } from '@hono/zod-openapi'
import {
  accountStateSchema,
  createErrorResponseSchema,
  isoDatetimeSchema,
  membershipRoleSchema,
  userStatusSchema,
  uuidSchema,
} from './common.js'

export const loginUnauthorizedErrorCodes = ['AUTH_INVALID_CREDENTIALS'] as const
export type LoginUnauthorizedErrorCode = (typeof loginUnauthorizedErrorCodes)[number]
export const loginUnauthorizedErrorResponseSchema = createErrorResponseSchema(
  'LoginUnauthorizedErrorResponse',
  loginUnauthorizedErrorCodes
)

export const loginForbiddenErrorCodes = [
  'AUTH_USER_DISABLED',
  'AUTH_USER_LOCKED',
  'AUTH_PASSWORD_LOGIN_DISABLED',
] as const
export type LoginForbiddenErrorCode = (typeof loginForbiddenErrorCodes)[number]
export const loginForbiddenErrorResponseSchema = createErrorResponseSchema(
  'LoginForbiddenErrorResponse',
  loginForbiddenErrorCodes
)

export const sessionUnauthorizedErrorCodes = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
] as const
export type SessionUnauthorizedErrorCode = (typeof sessionUnauthorizedErrorCodes)[number]
export const sessionUnauthorizedErrorResponseSchema = createErrorResponseSchema(
  'SessionUnauthorizedErrorResponse',
  sessionUnauthorizedErrorCodes
)

export const sessionForbiddenErrorCodes = ['AUTH_USER_DISABLED'] as const
export type SessionForbiddenErrorCode = (typeof sessionForbiddenErrorCodes)[number]
export const sessionForbiddenErrorResponseSchema = createErrorResponseSchema(
  'SessionForbiddenErrorResponse',
  sessionForbiddenErrorCodes
)

export const changePasswordUnauthorizedErrorCodes = [
  ...sessionUnauthorizedErrorCodes,
  ...loginUnauthorizedErrorCodes,
] as const
export type ChangePasswordUnauthorizedErrorCode =
  (typeof changePasswordUnauthorizedErrorCodes)[number]
export const changePasswordUnauthorizedErrorResponseSchema = createErrorResponseSchema(
  'ChangePasswordUnauthorizedErrorResponse',
  changePasswordUnauthorizedErrorCodes
)

export const activationUnauthorizedErrorCodes = ['AUTH_ACTIVATION_TOKEN_INVALID'] as const
export type ActivationUnauthorizedErrorCode = (typeof activationUnauthorizedErrorCodes)[number]
export const activationUnauthorizedErrorResponseSchema = createErrorResponseSchema(
  'ActivationUnauthorizedErrorResponse',
  activationUnauthorizedErrorCodes
)

export const authMembershipSchema = z
  .object({
    organization_id: uuidSchema,
    organization_name: z.string().min(1).max(255),
    role: membershipRoleSchema,
  })
  .openapi('AuthMembership')

export const authUserSchema = z
  .object({
    user_id: uuidSchema,
    email: z.string().email().max(255),
    display_name: z.string().min(1).max(255),
    global_role: z.enum(['none', 'admin']),
    status: userStatusSchema,
    account_state: accountStateSchema,
    password_changed_at: isoDatetimeSchema.nullable(),
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
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
