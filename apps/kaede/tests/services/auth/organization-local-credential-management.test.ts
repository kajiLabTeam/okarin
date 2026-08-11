import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createSession, hashPassword } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  disableMyOrganizationLocalCredential,
  getMyOrganizationLocalCredential,
  putMyOrganizationLocalCredential,
} from '../../../src/usecases/organization-local-credentials/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T12:00:00.000Z')

const createFixture = async () => {
  const user = await db
    .insertInto('users')
    .values({
      email: 'global@example.test',
      display_name: 'Local Credential User',
      global_role: 'none',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Credential Organization', slug: 'credential-organization' })
    .returningAll()
    .executeTakeFirstOrThrow()
  await db
    .insertInto('organization_auth_settings')
    .values({
      organization_id: organization.id,
      local_auth_enabled: true,
      oidc_auth_enabled: false,
      membership_grant_ttl_seconds: 28_800,
      reauthentication_interval_seconds: 14_400,
    })
    .execute()
  const membership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const { session } = await createSession({ userId: user.id, now }, db)
  const actor = {
    type: 'user',
    user_id: user.id,
    email: user.email,
    global_role: 'none',
    account_state: 'active',
    memberships: [
      { organization_id: organization.id, organization_name: organization.name, role: 'member' },
    ],
  } satisfies RequestActor
  return { actor, membership, organization, session, user }
}

describe('organization local credential management', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('recentなUser Sessionで初回Credentialを設定し、secretを返さない', async () => {
    const fixture = await createFixture()
    const result = await putMyOrganizationLocalCredential(
      fixture.actor,
      fixture.session.id,
      fixture.organization.id,
      { login_email: ' Login@Example.Test ', new_password: 'new-password' },
      {},
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        configured: true,
        login_email: 'Login@Example.Test',
        enabled: true,
      },
    })
    if (!result.ok) return
    expect(result.value).not.toHaveProperty('password_hash')
    expect(JSON.stringify(result.value)).not.toContain('new-password')
    const stored = await db
      .selectFrom('organization_local_credentials')
      .select(['normalized_login_email', 'password_hash'])
      .where('membership_id', '=', fixture.membership.id)
      .executeTakeFirstOrThrow()
    expect(stored.normalized_login_email).toBe('login@example.test')
    expect(stored.password_hash).not.toBe('new-password')
    await expect(
      getMyOrganizationLocalCredential(fixture.actor, fixture.organization.id, db)
    ).resolves.toMatchObject({ ok: true, value: { configured: true } })
  })

  it('現在passwordで変更し、そのCredential由来Grantだけをrevokeする', async () => {
    const fixture = await createFixture()
    const credential = await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: fixture.membership.id,
        organization_id: fixture.organization.id,
        login_email: 'old@example.test',
        normalized_login_email: 'old@example.test',
        password_hash: await hashPassword('current-password'),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('session_membership_authentications')
      .values({
        session_id: fixture.session.id,
        membership_id: fixture.membership.id,
        user_id: fixture.user.id,
        auth_method: 'local',
        policy_version: 1,
        local_credential_id: credential.id,
        authenticated_at: now,
        expires_at: new Date(now.getTime() + 3_600_000),
      })
      .execute()

    const result = await putMyOrganizationLocalCredential(
      fixture.actor,
      fixture.session.id,
      fixture.organization.id,
      {
        login_email: 'changed@example.test',
        current_password: 'current-password',
        new_password: 'changed-password',
      },
      {},
      now,
      db
    )

    expect(result).toMatchObject({ ok: true, value: { login_email: 'changed@example.test' } })
    await expect(
      db
        .selectFrom('session_membership_authentications')
        .select('revoked_at')
        .where('local_credential_id', '=', credential.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ revoked_at: now })
  })

  it('Organization内のnormalized login email重複を拒否する', async () => {
    const fixture = await createFixture()
    const otherUser = await db
      .insertInto('users')
      .values({ email: 'other@example.test', display_name: 'Other', status: 'active' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const otherMembership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: fixture.organization.id, user_id: otherUser.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: otherMembership.id,
        organization_id: fixture.organization.id,
        login_email: 'used@example.test',
        normalized_login_email: 'used@example.test',
        password_hash: await hashPassword('other-password'),
      })
      .execute()

    await expect(
      putMyOrganizationLocalCredential(
        fixture.actor,
        fixture.session.id,
        fixture.organization.id,
        { login_email: ' USED@example.test ', new_password: 'new-password' },
        {},
        now,
        db
      )
    ).resolves.toEqual({ ok: false, error: { type: 'LOCAL_LOGIN_EMAIL_CONFLICT' } })
  })

  it('利用可能なOIDC Linkがない場合は最後の認証方式を無効化しない', async () => {
    const fixture = await createFixture()
    await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: fixture.membership.id,
        organization_id: fixture.organization.id,
        login_email: 'only@example.test',
        normalized_login_email: 'only@example.test',
        password_hash: await hashPassword('current-password'),
      })
      .execute()

    await expect(
      disableMyOrganizationLocalCredential(
        fixture.actor,
        fixture.session.id,
        fixture.organization.id,
        { current_password: 'current-password' },
        {},
        now,
        db
      )
    ).resolves.toEqual({ ok: false, error: { type: 'LOCAL_CREDENTIAL_LAST_AUTH_METHOD' } })
  })
})
