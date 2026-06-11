import type { Kysely, Transaction } from 'kysely'
import { authUserSchema, loginRequestSchema } from '../schemas/auth.js'
import { hashPassword } from '../services/auth/password.js'
import { db } from '../services/db/index.js'
import type { DB } from '../services/db/index.js'
import { findUserByEmail, insertUser, updateUser } from '../services/users/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>

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
        temporaryPasswordExpiresAt: Date
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

const temporaryPasswordTtlMs = 24 * 60 * 60 * 1000

export const createAdminUser = async (
  params: CreateAdminUserParams,
  now: Date = new Date(),
  executor: DbExecutor = db
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
  const temporaryPasswordExpiresAt = new Date(now.getTime() + temporaryPasswordTtlMs)

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
        password_must_change: true,
        password_changed_at: null,
        temporary_password_expires_at: temporaryPasswordExpiresAt,
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
        temporaryPasswordExpiresAt,
      },
    }
  }

  const user = await insertUser(
    {
      email,
      display_name: displayName,
      password_hash: passwordHash,
      global_role: 'admin',
      is_active: true,
      password_must_change: true,
      password_changed_at: null,
      temporary_password_expires_at: temporaryPasswordExpiresAt,
    },
    executor
  )

  return {
    ok: true,
    value: {
      action: 'created',
      email: user.email,
      userId: user.id,
      temporaryPasswordExpiresAt,
    },
  }
}
