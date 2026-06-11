import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { verifyPassword } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { createAdminUser } from '../../../src/usecases/create-admin-user.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-06-10T00:00:00.000Z')
const expiresAt = new Date('2026-06-11T00:00:00.000Z')

const createUser = async (overrides: { email?: string; globalRole?: string } = {}) => {
  const passwordHash =
    '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

  return db
    .insertInto('users')
    .values({
      email: overrides.email ?? 'admin@example.com',
      display_name: 'Existing User',
      password_hash: passwordHash,
      global_role: overrides.globalRole ?? 'admin',
      is_active: true,
      password_must_change: false,
      password_changed_at: new Date('2026-06-09T00:00:00.000Z'),
      temporary_password_expires_at: null,
      failed_login_attempts: 5,
      locked_until: new Date('2026-06-10T00:15:00.000Z'),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

describe('createAdminUser', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('creates an admin user with a temporary password', async () => {
    const result = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'temporary-password',
        resetPassword: false,
      },
      now,
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value).toMatchObject({
      action: 'created',
      email: 'admin@example.com',
      temporaryPasswordExpiresAt: expiresAt,
    })

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', result.value.userId)
      .executeTakeFirstOrThrow()

    expect(user.global_role).toBe('admin')
    expect(user.password_must_change).toBe(true)
    expect(user.password_changed_at).toBeNull()
    expect(user.temporary_password_expires_at).toEqual(expiresAt)
    expect(user.is_active).toBe(true)
    expect(user.password_hash).not.toBe('temporary-password')
    await expect(verifyPassword(user.password_hash, 'temporary-password')).resolves.toBe(true)
  })

  it('returns an error when admin already exists without reset', async () => {
    await createUser()

    const result = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'new-password',
        resetPassword: false,
      },
      now,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'ADMIN_USER_ALREADY_EXISTS' },
    })
  })

  it('returns an error when email is used by a non-admin user', async () => {
    await createUser({ globalRole: 'none' })

    const result = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'new-password',
        resetPassword: true,
      },
      now,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'EMAIL_ALREADY_USED_BY_NON_ADMIN' },
    })
  })

  it('resets password only for existing admin when resetPassword is true', async () => {
    const existingUser = await createUser()

    const result = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'new-temporary-password',
        resetPassword: true,
      },
      now,
      db
    )

    expect(result).toEqual({
      ok: true,
      value: {
        action: 'password_reset',
        email: 'admin@example.com',
        userId: existingUser.id,
        temporaryPasswordExpiresAt: expiresAt,
      },
    })

    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', existingUser.id)
      .executeTakeFirstOrThrow()

    expect(updated.password_must_change).toBe(true)
    expect(updated.password_changed_at).toBeNull()
    expect(updated.temporary_password_expires_at).toEqual(expiresAt)
    expect(updated.failed_login_attempts).toBe(0)
    expect(updated.locked_until).toBeNull()
    await expect(verifyPassword(updated.password_hash, 'new-temporary-password')).resolves.toBe(
      true
    )
  })
})
