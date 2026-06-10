import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession, hashPassword, verifyPassword } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { changePassword, getMe, login, logout } from '../../../src/usecases/auth.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const insertUser = async (
  overrides: Partial<{
    email: string
    displayName: string
    globalRole: string
    isActive: boolean
    password: string
    passwordMustChange: boolean
    temporaryPasswordExpiresAt: Date | null
  }> = {}
) => {
  const password = overrides.password ?? 'temporary-password'
  const passwordHash = await hashPassword(password)

  return db
    .insertInto('users')
    .values({
      email: overrides.email ?? 'user@example.com',
      password_hash: passwordHash,
      display_name: overrides.displayName ?? 'User',
      global_role: overrides.globalRole ?? 'none',
      is_active: overrides.isActive ?? true,
      password_must_change: overrides.passwordMustChange ?? true,
      password_changed_at: null,
      temporary_password_expires_at:
        overrides.temporaryPasswordExpiresAt ?? new Date('2026-06-11T00:00:00.000Z'),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

const insertOrganizationMembership = async (userId: string) => {
  const organization = await db
    .insertInto('organizations')
    .values({
      name: 'Group A',
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await db
    .insertInto('organization_memberships')
    .values({
      organization_id: organization.id,
      user_id: userId,
      role: 'manager',
    })
    .execute()

  return organization
}

describe('auth usecase', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('login は password を検証して session token と user を返す', async () => {
    const user = await insertUser()
    const organization = await insertOrganizationMembership(user.id)

    const result = await login(
      {
        email: 'user@example.com',
        password: 'temporary-password',
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.sessionToken).toEqual(expect.any(String))
    expect(result.value.user).toEqual({
      user_id: user.id,
      email: 'user@example.com',
      display_name: 'User',
      global_role: 'none',
      password_must_change: true,
      password_changed_at: null,
      temporary_password_expires_at: '2026-06-11T00:00:00.000Z',
      memberships: [
        {
          organization_id: organization.id,
          organization_name: 'Group A',
          role: 'manager',
        },
      ],
    })

    const session = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()

    expect(session.expires_at).toEqual(new Date('2026-06-17T00:00:00.000Z'))
  })

  it('login は password 不一致なら AUTH_INVALID_CREDENTIALS を返す', async () => {
    await insertUser()

    const result = await login(
      {
        email: 'user@example.com',
        password: 'wrong-password',
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_INVALID_CREDENTIALS',
      },
    })
  })

  it('login は temporary password 期限切れなら AUTH_TEMPORARY_PASSWORD_EXPIRED を返す', async () => {
    await insertUser({
      temporaryPasswordExpiresAt: new Date('2026-06-09T00:00:00.000Z'),
    })

    const result = await login(
      {
        email: 'user@example.com',
        password: 'temporary-password',
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_TEMPORARY_PASSWORD_EXPIRED',
      },
    })
  })

  it('getMe は session token から user を返す', async () => {
    const user = await insertUser({
      passwordMustChange: false,
      temporaryPasswordExpiresAt: null,
    })
    const { token } = await createSession(
      {
        userId: user.id,
        now: new Date('2026-06-10T00:00:00.000Z'),
      },
      db
    )

    const result = await getMe(token, new Date('2026-06-11T00:00:00.000Z'), db)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.user.user_id).toBe(user.id)
    expect(result.value.user.password_must_change).toBe(false)
  })

  it('logout は session を revoke する', async () => {
    const user = await insertUser()
    const { token } = await createSession({ userId: user.id }, db)

    await logout(token, new Date('2026-06-11T00:00:00.000Z'), db)

    const session = await db.selectFrom('sessions').selectAll().executeTakeFirstOrThrow()
    expect(session.revoked_at).toEqual(new Date('2026-06-11T00:00:00.000Z'))
  })

  it('changePassword は current password を検証して password 状態を更新し、全セッションを無効化する', async () => {
    const user = await insertUser()
    const { token: currentToken } = await createSession({ userId: user.id }, db)
    const { token: _otherToken } = await createSession({ userId: user.id }, db)

    const result = await changePassword(
      currentToken,
      {
        current_password: 'temporary-password',
        new_password: 'new-password',
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: true,
      value: {
        ok: true,
      },
    })

    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()

    expect(updated.password_must_change).toBe(false)
    expect(updated.password_changed_at).toEqual(new Date('2026-06-10T00:00:00.000Z'))
    expect(updated.temporary_password_expires_at).toBeNull()
    await expect(verifyPassword(updated.password_hash, 'new-password')).resolves.toBe(true)

    const sessions = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', user.id)
      .execute()

    expect(sessions).toHaveLength(2)
    for (const session of sessions) {
      expect(session.revoked_at).toEqual(new Date('2026-06-10T00:00:00.000Z'))
    }
  })

  it('changePassword は current password 不一致なら AUTH_INVALID_CREDENTIALS を返す', async () => {
    const user = await insertUser()
    const { token } = await createSession({ userId: user.id }, db)

    const result = await changePassword(
      token,
      {
        current_password: 'wrong-password',
        new_password: 'new-password',
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_INVALID_CREDENTIALS',
      },
    })
  })
})
