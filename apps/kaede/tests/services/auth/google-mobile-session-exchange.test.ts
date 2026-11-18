import { OpenAPIHono } from '@hono/zod-openapi'
import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { registerMeRoute } from '../../../src/routes/auth/me.js'
import { registerMobileSessionExchangeRoute } from '../../../src/routes/auth/mobile-session-exchange.js'
import { createSession, createPkceCodeChallenge } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  consumeMobileSessionExchangeCode,
  issueGoogleMobileSessionExchangeCode,
} from '../../../src/services/mobile-session-exchange/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const verifier = 'v'.repeat(43)
const challenge = createPkceCodeChallenge(verifier)

const fixture = async () => {
  const user = await db
    .insertInto('users')
    .values({
      email: 'mobile@example.test',
      contact_email: 'mobile@example.test',
      normalized_contact_email: 'mobile@example.test',
      display_name: 'Mobile',
      password_hash: null,
      global_role: 'none',
      status: 'active',
      password_changed_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const { token, session } = await createSession(
    { authMethod: 'oidc', userId: user.id, now: new Date() },
    db
  )
  const code = await issueGoogleMobileSessionExchangeCode(token, challenge, new Date(), db)
  return { user, token, session, code }
}

describe('global Google mobile session exchange', () => {
  beforeEach(() => resetDatabase(db))
  afterAll(() => db.destroy())

  it('upgrades the legacy exchange table while preserving organization exchange rows', async () => {
    const migration = await readFile(
      new URL(
        '../../../../../db/migrations/20261118020000_google_mobile_session_exchange.sql',
        import.meta.url
      ),
      'utf8'
    )
    const [up, down] = migration.split('-- migrate:down')
    if (!up || !down) throw new Error('migration sections missing')
    await expect(
      db.transaction().execute(async (trx) => {
        await sql.raw(down).execute(trx)
        await sql`INSERT INTO mobile_session_exchange_codes
        (code_hash, oidc_transaction_id, session_id, user_id, organization_id, intent, expires_at)
        VALUES ('legacy-code-hash', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'login', now() + interval '1 minute')`.execute(
          trx
        )
        await sql.raw(up.replace('-- migrate:up', '')).execute(trx)
        const legacy = await trx
          .selectFrom('mobile_session_exchange_codes')
          .selectAll()
          .executeTakeFirstOrThrow()
        expect(legacy.code_hash).toBe('legacy-code-hash')
        expect(legacy.code_challenge).toBeNull()
        expect(legacy.organization_id).not.toBeNull()
        throw new Error('rollback migration test')
      })
    ).rejects.toThrow('rollback migration test')
  })

  it('exchanges once, rotates the cookie and permits an authenticated API without granting organization auth', async () => {
    const { user, token, session, code } = await fixture()
    const app = new OpenAPIHono()
    registerMobileSessionExchangeRoute(app)
    registerMeRoute(app)
    const exchange = () =>
      app.request('/mobile/session/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mobile_session_exchange_code: code, code_verifier: verifier }),
      })
    const response = await exchange()
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toMatch(/^okarin_session=.+/)
    expect(cookie).not.toBe('okarin_session=' + token)
    if (!cookie) throw new Error('session cookie missing')
    const me = await app.request('/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ user: { user_id: user.id } })
    expect((await exchange()).status).toBe(400)
    expect(
      await db
        .selectFrom('session_membership_authentications')
        .selectAll()
        .where('session_id', '=', session.id)
        .execute()
    ).toEqual([])
    const row = await db
      .selectFrom('mobile_session_exchange_codes')
      .selectAll()
      .where('session_id', '=', session.id)
      .executeTakeFirstOrThrow()
    expect(row.code_hash).not.toBe(code)
    expect(row.oidc_transaction_id).toBeNull()
    expect(row.organization_id).toBeNull()
  })

  it('rejects an incorrect verifier without consuming the code', async () => {
    const { code } = await fixture()
    expect(
      await consumeMobileSessionExchangeCode(code, 'x'.repeat(43), new Date(), db)
    ).toBeUndefined()
    expect(await consumeMobileSessionExchangeCode(code, verifier, new Date(), db)).toBeDefined()
    expect(await consumeMobileSessionExchangeCode(code, verifier, new Date(), db)).toBeUndefined()
  })

  it('rejects expired and unknown codes', async () => {
    const { code } = await fixture()
    expect(
      await consumeMobileSessionExchangeCode(code, verifier, new Date(Date.now() + 61_000), db)
    ).toBeUndefined()
    expect(
      await consumeMobileSessionExchangeCode('unknown', verifier, new Date(), db)
    ).toBeUndefined()
  })

  it('allows only one concurrent exchange', async () => {
    const { code } = await fixture()
    const results = await Promise.all(
      [0, 1].map(() => consumeMobileSessionExchangeCode(code, verifier, new Date(), db))
    )
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('rejects a revoked session', async () => {
    const { code, session } = await fixture()
    await db
      .updateTable('sessions')
      .set({ revoked_at: new Date() })
      .where('id', '=', session.id)
      .execute()
    expect(await consumeMobileSessionExchangeCode(code, verifier, new Date(), db)).toBeUndefined()
  })
})
