import { authUserSchema, loginRequestSchema } from '../../schemas/auth.js'
import { hashPassword } from '../../services/auth/password.js'
import type { DbExecutor } from '../../services/executor.js'
import { findUserByEmail, insertUser, updateUser } from '../../services/users/index.js'

export type CreateAdminUserError =
  | { type: 'ADMIN_USER_ALREADY_EXISTS' }
  | { type: 'EMAIL_ALREADY_USED_BY_NON_ADMIN' }
  | { type: 'VALIDATION_ERROR'; message: string }

export type CreateAdminUserResult =
  | {
      ok: true
      value: {
        action: 'created' | 'password_reset'
        email: string
        userId: string
      }
    }
  | {
      ok: false
      error: CreateAdminUserError
    }

export interface CreateAdminUserParams {
  email: string
  displayName: string
  password: string
  resetPassword: boolean
}

export const createAdminUser = async (
  params: CreateAdminUserParams,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<CreateAdminUserResult> => {
  const emailValidation = loginRequestSchema.shape.email.safeParse(params.email)
  if (!emailValidation.success) {
    return {
      ok: false,
      error: {
        type: 'VALIDATION_ERROR',
        message: `Invalid email: ${emailValidation.error.message}`,
      },
    }
  }

  const passwordValidation = loginRequestSchema.shape.password.safeParse(params.password)
  if (!passwordValidation.success) {
    return {
      ok: false,
      error: {
        type: 'VALIDATION_ERROR',
        message: `Invalid password: ${passwordValidation.error.message}`,
      },
    }
  }

  const displayNameValidation = authUserSchema.shape.display_name.safeParse(params.displayName)
  if (!displayNameValidation.success) {
    return {
      ok: false,
      error: {
        type: 'VALIDATION_ERROR',
        message: `Invalid display name: ${displayNameValidation.error.message}`,
      },
    }
  }

  const email = params.email.trim()
  const displayName = params.displayName.trim()
  const passwordHash = await hashPassword(params.password)

  const existingUser = await findUserByEmail(email, executor)

  if (existingUser) {
    if (existingUser.global_role !== 'admin') {
      return {
        ok: false,
        error: { type: 'EMAIL_ALREADY_USED_BY_NON_ADMIN' },
      }
    }

    if (!params.resetPassword) {
      return {
        ok: false,
        error: { type: 'ADMIN_USER_ALREADY_EXISTS' },
      }
    }

    const updated = await updateUser(
      existingUser.id,
      {
        display_name: displayName,
        password_hash: passwordHash,
        password_changed_at: now,
        status: 'active',
        failed_login_attempts: 0,
        locked_until: null,
      },
      executor
    )

    return {
      ok: true,
      value: {
        action: 'password_reset',
        email: updated.email,
        userId: updated.id,
      },
    }
  }

  const user = await insertUser(
    {
      email,
      display_name: displayName,
      password_hash: passwordHash,
      global_role: 'admin',
      password_changed_at: now,
      status: 'active',
    },
    executor
  )

  return {
    ok: true,
    value: {
      action: 'created',
      email: user.email,
      userId: user.id,
    },
  }
}
