import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, hashPassword, verifyPassword } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { createAdminUser } from '../../../src/usecases/auth/create-admin-user.js'
import {
  changePassword,
  completeGoogleOidcLink,
  completeGoogleOidcLogin,
  getMe,
  login,
  logout,
} from '../../../src/usecases/auth/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const insertUser = async (
  overrides: Partial<{
    email: string
    displayName: string
    globalRole: string
    status: 'pending_activation' | 'active' | 'disabled'
    password: string
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
      password_changed_at: null,
      status: overrides.status ?? 'active',
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
    expect(result.value.session_auth_method).toBe('password')
    expect(result.value.user).toEqual({
      user_id: user.id,
      email: 'user@example.com',
      display_name: 'User',
      global_role: 'none',
      status: 'active',
      account_state: 'active',
      password_changed_at: null,
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
    expect(session.auth_method).toBe('password')
  })

  it('login は password 不一致なら failed_login_attempts を増やし AUTH_INVALID_CREDENTIALS を返す', async () => {
    const user = await insertUser()

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

    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(updated.failed_login_attempts).toBe(1)
  })

  it('login は 5回連続失敗でアカウントをロックする', async () => {
    const user = await insertUser()

    // 4回失敗させる
    for (let i = 0; i < 4; i++) {
      await login(
        { email: 'user@example.com', password: 'wrong-password' },
        new Date('2026-06-10T00:00:00.000Z'),
        db
      )
    }

    // 5回目
    const result = await login(
      { email: 'user@example.com', password: 'wrong-password' },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_USER_LOCKED' },
    })

    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(updated.failed_login_attempts).toBe(5)
    expect(updated.locked_until).toEqual(new Date('2026-06-10T00:15:00.000Z'))
  })

  it('login はロック期間中なら AUTH_USER_LOCKED を返す', async () => {
    const user = await insertUser()
    await db
      .updateTable('users')
      .set({
        locked_until: new Date('2026-06-10T00:15:00.000Z'),
      })
      .where('id', '=', user.id)
      .execute()

    const result = await login(
      { email: 'user@example.com', password: 'temporary-password' },
      new Date('2026-06-10T00:14:59.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_USER_LOCKED' },
    })
  })

  it('login はロック期間を過ぎれば再度ログイン可能になりカウントをリセットする', async () => {
    const user = await insertUser()
    await db
      .updateTable('users')
      .set({
        failed_login_attempts: 5,
        locked_until: new Date('2026-06-10T00:15:00.000Z'),
      })
      .where('id', '=', user.id)
      .execute()

    const result = await login(
      { email: 'user@example.com', password: 'temporary-password' },
      new Date('2026-06-10T00:15:01.000Z'),
      db
    )

    expect(result.ok).toBe(true)

    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(updated.failed_login_attempts).toBe(0)
    expect(updated.locked_until).toBeNull()
  })

  it('Google OIDC callback は未登録 user を pending user として作成して session を発行する', async () => {
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'google-subject',
        email: 'oidc-user@example.com',
        emailVerified: true,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    const result = await completeGoogleOidcLogin(
      {
        code: 'authorization-code',
        state: 'state-value',
        expectedState: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'code-verifier',
      },
      client as never,
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.sessionToken).toEqual(expect.any(String))

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'oidc-user@example.com')
      .executeTakeFirstOrThrow()
    expect(user).toMatchObject({
      display_name: 'OIDC User',
      global_role: 'none',
      status: 'active',
    })

    const identity = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(identity).toMatchObject({
      provider: 'google',
      provider_subject: 'google-subject',
      email: 'oidc-user@example.com',
      email_verified: true,
      hosted_domain: null,
    })

    const session = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(session.auth_method).toBe('oidc')
  })

  it('Google OIDC callback は既存 user と email が一致すれば Google identity を紐づける', async () => {
    const user = await insertUser({
      email: 'user@example.com',
    })
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'google-subject',
        email: 'user@example.com',
        emailVerified: true,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    const result = await completeGoogleOidcLogin(
      {
        code: 'authorization-code',
        state: 'state-value',
        expectedState: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'code-verifier',
      },
      client as never,
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const identity = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(identity).toMatchObject({
      provider: 'google',
      provider_subject: 'google-subject',
      email: 'user@example.com',
      email_verified: true,
      hosted_domain: null,
    })

    const updatedUser = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(updatedUser).toMatchObject({
      password_changed_at: null,
    })

    const session = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(session.auth_method).toBe('oidc')
  })

  it('Google OIDC callback は既存 user に別 Google identity があれば conflict を返す', async () => {
    const user = await insertUser({
      email: 'user@example.com',
    })
    await db
      .insertInto('auth_identities')
      .values({
        user_id: user.id,
        provider: 'google',
        provider_subject: 'existing-google-subject',
        email: 'user@example.com',
        email_verified: true,
        hosted_domain: null,
      })
      .execute()
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'new-google-subject',
        email: 'user@example.com',
        emailVerified: true,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    await expect(
      completeGoogleOidcLogin(
        {
          code: 'authorization-code',
          state: 'state-value',
          expectedState: 'state-value',
          nonce: 'nonce-value',
          codeVerifier: 'code-verifier',
        },
        client as never,
        new Date('2026-06-10T00:00:00.000Z'),
        db
      )
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_IDENTITY_CONFLICT' },
    })
  })

  it('Google OIDC link は bootstrap CLI で作成した admin user に Google identity を紐づける', async () => {
    const adminResult = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Bootstrap Admin',
        password: 'temporary-password',
        resetPassword: false,
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )
    expect(adminResult.ok).toBe(true)
    if (!adminResult.ok) {
      return
    }

    const cliCreatedAdmin = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(cliCreatedAdmin).toMatchObject({
      email: 'admin@example.com',
      display_name: 'Bootstrap Admin',
      global_role: 'admin',
      status: 'active',
      password_changed_at: new Date('2026-06-10T00:00:00.000Z'),
    })
    await expect(
      db
        .selectFrom('auth_identities')
        .selectAll()
        .where('user_id', '=', adminResult.value.userId)
        .executeTakeFirst()
    ).resolves.toBeUndefined()
    const { token } = await createSession(
      {
        userId: adminResult.value.userId,
        now: new Date('2026-06-10T00:00:00.000Z'),
      },
      db
    )

    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'bootstrap-admin-google-subject',
        email: 'admin@example.com',
        emailVerified: true,
        name: 'Admin From Google',
        hostedDomain: null,
      }),
    }

    const result = await completeGoogleOidcLink(
      token,
      {
        code: 'authorization-code',
        state: 'state-value',
        expectedState: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'code-verifier',
      },
      client as never,
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: true,
      value: { ok: true },
    })

    const identity = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('user_id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(identity).toMatchObject({
      provider: 'google',
      provider_subject: 'bootstrap-admin-google-subject',
      email: 'admin@example.com',
      email_verified: true,
      hosted_domain: null,
    })

    const adminAfterOidc = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(adminAfterOidc).toMatchObject({
      global_role: 'admin',
      password_changed_at: new Date('2026-06-10T00:00:00.000Z'),
    })

    const users = await db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('email', '=', 'admin@example.com')
      .execute()
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe(adminResult.value.userId)
  })

  it('Google OIDC callback は bootstrap CLI で作成した admin user を oidc session でログインする', async () => {
    const adminResult = await createAdminUser(
      {
        email: 'admin@example.com',
        displayName: 'Bootstrap Admin',
        password: 'temporary-password',
        resetPassword: false,
      },
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )
    expect(adminResult.ok).toBe(true)
    if (!adminResult.ok) {
      return
    }
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'bootstrap-admin-google-subject',
        email: 'admin@example.com',
        emailVerified: true,
        name: 'Admin From Google',
        hostedDomain: null,
      }),
    }

    const result = await completeGoogleOidcLogin(
      {
        code: 'authorization-code',
        state: 'state-value',
        expectedState: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'code-verifier',
      },
      client as never,
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const adminAfterOidc = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(adminAfterOidc).toMatchObject({
      global_role: 'admin',
      password_changed_at: new Date('2026-06-10T00:00:00.000Z'),
    })

    const identity = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('user_id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(identity).toMatchObject({
      provider: 'google',
      provider_subject: 'bootstrap-admin-google-subject',
      email: 'admin@example.com',
      email_verified: true,
    })

    const session = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', adminResult.value.userId)
      .executeTakeFirstOrThrow()
    expect(session.auth_method).toBe('oidc')
  })

  it('Google OIDC link はログイン済み user に Google subject を紐付ける', async () => {
    const user = await insertUser({
      email: 'user@example.com',
    })
    const { token } = await createSession(
      {
        userId: user.id,
        now: new Date('2026-06-10T00:00:00.000Z'),
      },
      db
    )
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'google-subject',
        email: 'changed-google-email@example.com',
        emailVerified: true,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    const result = await completeGoogleOidcLink(
      token,
      {
        code: 'authorization-code',
        state: 'state-value',
        expectedState: 'state-value',
        nonce: 'nonce-value',
        codeVerifier: 'code-verifier',
      },
      client as never,
      new Date('2026-06-10T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: true,
      value: { ok: true },
    })

    const identity = await db
      .selectFrom('auth_identities')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(identity).toMatchObject({
      provider: 'google',
      provider_subject: 'google-subject',
      email: 'changed-google-email@example.com',
      email_verified: true,
    })

    const updatedUser = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(updatedUser).toMatchObject({
      password_changed_at: null,
    })
  })

  it('Google OIDC link は他 user に紐付いた Google subject を拒否する', async () => {
    const linkedUser = await insertUser({
      email: 'linked@example.com',
    })
    const user = await insertUser({
      email: 'user@example.com',
    })
    await db
      .insertInto('auth_identities')
      .values({
        user_id: linkedUser.id,
        provider: 'google',
        provider_subject: 'google-subject',
        email: 'linked@example.com',
        email_verified: true,
        hosted_domain: null,
      })
      .execute()
    const { token } = await createSession(
      {
        userId: user.id,
        now: new Date('2026-06-10T00:00:00.000Z'),
      },
      db
    )
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'google-subject',
        email: 'user@example.com',
        emailVerified: true,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    await expect(
      completeGoogleOidcLink(
        token,
        {
          code: 'authorization-code',
          state: 'state-value',
          expectedState: 'state-value',
          nonce: 'nonce-value',
          codeVerifier: 'code-verifier',
        },
        client as never,
        new Date('2026-06-10T00:00:00.000Z'),
        db
      )
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_IDENTITY_CONFLICT' },
    })
  })

  it('Google OIDC callback は state mismatch を拒否する', async () => {
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockRejectedValue(new Error('should not verify token')),
    }

    await expect(
      completeGoogleOidcLogin(
        {
          code: 'authorization-code',
          state: 'wrong-state',
          expectedState: 'state-value',
          nonce: 'nonce-value',
          codeVerifier: 'code-verifier',
        },
        client as never,
        new Date('2026-06-10T00:00:00.000Z'),
        db
      )
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_INVALID_STATE' },
    })
  })

  it('Google OIDC callback は email_verified=false を拒否する', async () => {
    const client = {
      exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
      verifyIdToken: vi.fn().mockResolvedValue({
        sub: 'google-subject',
        email: 'oidc-user@example.com',
        emailVerified: false,
        name: 'OIDC User',
        hostedDomain: null,
      }),
    }

    await expect(
      completeGoogleOidcLogin(
        {
          code: 'authorization-code',
          state: 'state-value',
          expectedState: 'state-value',
          nonce: 'nonce-value',
          codeVerifier: 'code-verifier',
        },
        client as never,
        new Date('2026-06-10T00:00:00.000Z'),
        db
      )
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_EMAIL_UNVERIFIED' },
    })
  })

  it('getMe は session token から user を返す', async () => {
    const user = await insertUser()
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
    expect(result.value.session_auth_method).toBe('password')
    expect(result.value.user.account_state).toBe('pending_membership')
    expect(result.value.user.status).toBe('active')
  })

  it('getMe は oidc session の auth method を返す', async () => {
    const user = await insertUser()
    const { token } = await createSession(
      {
        authMethod: 'oidc',
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

    expect(result.value.session_auth_method).toBe('oidc')
    expect(result.value.user.status).toBe('active')
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

    expect(updated.password_changed_at).toEqual(new Date('2026-06-10T00:00:00.000Z'))
    expect(updated.password_hash).not.toBeNull()
    await expect(verifyPassword(updated.password_hash ?? '', 'new-password')).resolves.toBe(true)

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
