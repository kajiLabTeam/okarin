import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  findSessionByToken,
  findValidSessionByToken,
  revokeSessionByToken,
  updateSessionLastSeen,
} from '../../../src/services/auth/index.js'
import { hashSessionToken } from '../../../src/services/auth/session-token.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const insertUser = async () => {
  return db
    .insertInto('users')
    .values({
      email: 'session-user@example.com',
      password_hash: 'hashed-password',
      display_name: 'Session User',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()
}

describe('session repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('session を作成し token hash のみ保存する', async () => {
    const user = await insertUser()
    const now = new Date('2026-06-10T00:00:00.000Z')

    const { token, session } = await createSession({ userId: user.id, now }, db)

    expect(token).not.toBe(session.session_hash)
    expect(session.auth_method).toBe('password')
    expect(session.session_hash).toBe(hashSessionToken(token))
    expect(session.expires_at).toEqual(new Date('2026-06-17T00:00:00.000Z'))
    expect(session.revoked_at).toBeNull()
    expect(session.last_seen_at).toBeNull()
  })

  it('session の auth method を保存する', async () => {
    const user = await insertUser()

    const { session } = await createSession({ authMethod: 'oidc', userId: user.id }, db)

    expect(session.auth_method).toBe('oidc')
  })

  it('token から session を取得できる', async () => {
    const user = await insertUser()
    const { token, session } = await createSession({ userId: user.id }, db)

    const found = await findSessionByToken(token, db)

    expect(found?.id).toBe(session.id)
  })

  it('有効な token は valid session として返す', async () => {
    const user = await insertUser()
    const now = new Date('2026-06-10T00:00:00.000Z')
    const { token, session } = await createSession({ userId: user.id, now }, db)

    const result = await findValidSessionByToken(token, new Date('2026-06-11T00:00:00.000Z'), db)

    expect(result).toEqual({
      ok: true,
      session,
    })
  })

  it('存在しない token は SESSION_NOT_FOUND を返す', async () => {
    const result = await findValidSessionByToken('unknown-token', new Date(), db)

    expect(result).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    })
  })

  it('空 token は SESSION_NOT_FOUND を返す', async () => {
    const result = await findValidSessionByToken('   ', new Date(), db)

    expect(result).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    })
  })

  it('期限切れ session は SESSION_EXPIRED を返す', async () => {
    const user = await insertUser()
    const now = new Date('2026-06-10T00:00:00.000Z')
    const { token } = await createSession({ userId: user.id, now }, db)

    const result = await findValidSessionByToken(token, new Date('2026-06-17T00:00:00.001Z'), db)

    expect(result).toEqual({
      ok: false,
      error: 'SESSION_EXPIRED',
    })
  })

  it('revoke 済み session は SESSION_REVOKED を返す', async () => {
    const user = await insertUser()
    const now = new Date('2026-06-10T00:00:00.000Z')
    const revokedAt = new Date('2026-06-11T00:00:00.000Z')
    const { token } = await createSession({ userId: user.id, now }, db)

    await revokeSessionByToken(token, revokedAt, db)
    const result = await findValidSessionByToken(token, new Date('2026-06-12T00:00:00.000Z'), db)

    expect(result).toEqual({
      ok: false,
      error: 'SESSION_REVOKED',
    })
  })

  it('token から session を revoke できる', async () => {
    const user = await insertUser()
    const revokedAt = new Date('2026-06-11T00:00:00.000Z')
    const { token } = await createSession({ userId: user.id }, db)

    const revoked = await revokeSessionByToken(token, revokedAt, db)

    expect(revoked?.revoked_at).toEqual(revokedAt)
  })

  it('空 token の revoke は no-op として扱う', async () => {
    const revoked = await revokeSessionByToken('   ', new Date(), db)

    expect(revoked).toBeUndefined()
  })

  it('last_seen_at を更新できる', async () => {
    const user = await insertUser()
    const lastSeenAt = new Date('2026-06-11T00:00:00.000Z')
    const { session } = await createSession({ userId: user.id }, db)

    const updated = await updateSessionLastSeen(session.id, lastSeenAt, db)

    expect(updated?.last_seen_at).toEqual(lastSeenAt)
  })
})
