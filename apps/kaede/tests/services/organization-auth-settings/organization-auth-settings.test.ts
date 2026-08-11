import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { patchOrganizationAuthSettings } from '../../../src/usecases/organization-auth-settings/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const createFixture = async () => {
  const owner = await db
    .insertInto('users')
    .values({
      email: 'auth-settings-owner@example.com',
      display_name: 'Auth Settings Owner',
      password_hash: null,
      global_role: 'none',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Auth Settings Organization', slug: 'auth-settings-org' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const membership = await db
    .insertInto('organization_memberships')
    .values({
      organization_id: organization.id,
      user_id: owner.id,
      role: 'owner',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  if (!membership.id) throw new Error('membership id is required')
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
  const credential = await db
    .insertInto('organization_local_credentials')
    .values({
      membership_id: membership.id,
      organization_id: organization.id,
      login_email: owner.email,
      normalized_login_email: owner.email,
      password_hash: passwordHash,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const session = await db
    .insertInto('sessions')
    .values({
      user_id: owner.id,
      session_hash: 'auth-settings-session-hash',
      expires_at: new Date('2026-08-13T00:00:00.000Z'),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  await db
    .insertInto('session_membership_authentications')
    .values({
      session_id: session.id,
      membership_id: membership.id,
      user_id: owner.id,
      auth_method: 'local',
      policy_version: 1,
      local_credential_id: credential.id,
      member_oidc_identity_id: null,
      authenticated_at: new Date('2026-08-11T00:00:00.000Z'),
      expires_at: new Date('2026-08-12T00:00:00.000Z'),
    })
    .execute()

  const actor: RequestActor = {
    type: 'user',
    user_id: owner.id,
    email: owner.email,
    global_role: 'none',
    account_state: 'active',
    memberships: [
      {
        organization_id: organization.id,
        organization_name: organization.name,
        role: 'owner',
      },
    ],
  }
  return { actor, membership, organization, session }
}

describe('organization auth settings with database', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('PolicyとversionとAuditを同時に更新し、既存Grantは一括更新しない', async () => {
    const fixture = await createFixture()

    const result = await patchOrganizationAuthSettings(
      fixture.actor,
      fixture.organization.id,
      { membership_grant_ttl_seconds: 36_000, reauthentication_interval_seconds: 18_000 },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        policy_version: 2,
        membership_grant_ttl_seconds: 36_000,
        reauthentication_interval_seconds: 18_000,
      },
    })
    const stored = await db
      .selectFrom('organization_auth_settings')
      .selectAll()
      .where('organization_id', '=', fixture.organization.id)
      .executeTakeFirstOrThrow()
    expect(stored.policy_version).toBe('2')

    const grant = await db
      .selectFrom('session_membership_authentications')
      .select(['policy_version', 'revoked_at'])
      .where('session_id', '=', fixture.session.id)
      .executeTakeFirstOrThrow()
    expect(grant).toMatchObject({ policy_version: '1', revoked_at: null })

    const event = await db
      .selectFrom('audit_events')
      .selectAll()
      .where('organization_id', '=', fixture.organization.id)
      .where('target_type', '=', 'organization_auth_settings')
      .executeTakeFirstOrThrow()
    expect(event).toMatchObject({
      actor_user_id: fixture.actor.user_id,
      actor_membership_id: fixture.membership.id,
      action: 'update',
      changed_fields: ['membership_grant_ttl_seconds', 'reauthentication_interval_seconds'],
    })
  })

  it('enabled Providerがない状態ではOIDC master switchを有効化しない', async () => {
    const fixture = await createFixture()

    await expect(
      patchOrganizationAuthSettings(
        fixture.actor,
        fixture.organization.id,
        { oidc_auth_enabled: true },
        db
      )
    ).resolves.toEqual({ ok: false, error: { type: 'OIDC_PROVIDER_REQUIRED' } })

    const stored = await db
      .selectFrom('organization_auth_settings')
      .select(['oidc_auth_enabled', 'policy_version'])
      .where('organization_id', '=', fixture.organization.id)
      .executeTakeFirstOrThrow()
    expect(stored).toEqual({ oidc_auth_enabled: false, policy_version: '1' })
    const events = await db.selectFrom('audit_events').select('id').execute()
    expect(events).toHaveLength(0)
  })
})
