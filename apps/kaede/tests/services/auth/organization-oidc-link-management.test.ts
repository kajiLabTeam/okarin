import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  getMyOrganizationOidcLinks,
  unlinkMyOrganizationOidcIdentity,
} from '../../../src/usecases/organization-oidc-links/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T12:00:00.000Z')

const createFixture = async (withLocalCredential: boolean) => {
  const user = await db
    .insertInto('users')
    .values({ email: 'oidc-link@example.test', display_name: 'OIDC Link', status: 'active' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'OIDC Link Organization', slug: 'oidc-link-organization' })
    .returningAll()
    .executeTakeFirstOrThrow()
  await db
    .insertInto('organization_auth_settings')
    .values({
      organization_id: organization.id,
      local_auth_enabled: true,
      oidc_auth_enabled: true,
      membership_grant_ttl_seconds: 28_800,
      reauthentication_interval_seconds: 14_400,
    })
    .execute()
  const membership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const provider = await db
    .insertInto('organization_oidc_providers')
    .values({
      organization_id: organization.id,
      name: 'Google',
      issuer: 'https://accounts.google.com',
      client_id: 'client-id-not-returned',
      client_secret_ref: 'secret-ref-not-returned',
      scopes: ['openid'],
      allowed_hosted_domains: null,
      enabled: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const identity = await db
    .insertInto('oidc_identities')
    .values({
      user_id: user.id,
      issuer: 'https://accounts.google.com',
      subject: 'subject-not-returned',
      last_claimed_email: user.email,
      last_claimed_email_verified: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const link = await db
    .insertInto('organization_member_oidc_identities')
    .values({
      membership_id: membership.id,
      organization_id: organization.id,
      user_id: user.id,
      organization_oidc_provider_id: provider.id,
      oidc_identity_id: identity.id,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const localCredential = withLocalCredential
    ? await db
        .insertInto('organization_local_credentials')
        .values({
          membership_id: membership.id,
          organization_id: organization.id,
          login_email: 'local@example.test',
          normalized_login_email: 'local@example.test',
          password_hash: 'hash-not-returned',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    : undefined
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
  return { actor, identity, link, localCredential, membership, organization, provider, user }
}

describe('organization OIDC link management', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('本人のactive LinkをProvider表示情報だけで返す', async () => {
    const fixture = await createFixture(false)
    const result = await getMyOrganizationOidcLinks(fixture.actor, fixture.organization.id, db)

    expect(result).toEqual({
      ok: true,
      value: {
        links: [
          {
            id: fixture.link.id,
            provider: { id: fixture.provider.id, display_name: 'Google', enabled: true },
            linked_at: fixture.link.created_at.toISOString(),
          },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain('client-id-not-returned')
    expect(JSON.stringify(result)).not.toContain('subject-not-returned')
  })

  it('Linkを論理失効し、対象Link由来GrantだけをrevokeしてIdentityは残す', async () => {
    const fixture = await createFixture(true)
    const oidcSession = await createSession(
      { userId: fixture.user.id, authMethod: 'oidc', now },
      db
    )
    const localSession = await createSession({ userId: fixture.user.id, now }, db)
    await db
      .insertInto('session_membership_authentications')
      .values([
        {
          session_id: oidcSession.session.id,
          membership_id: fixture.membership.id,
          user_id: fixture.user.id,
          auth_method: 'oidc',
          policy_version: 1,
          member_oidc_identity_id: fixture.link.id,
          authenticated_at: now,
          expires_at: new Date(now.getTime() + 3_600_000),
        },
        {
          session_id: localSession.session.id,
          membership_id: fixture.membership.id,
          user_id: fixture.user.id,
          auth_method: 'local',
          policy_version: 1,
          local_credential_id: fixture.localCredential?.id,
          authenticated_at: now,
          expires_at: new Date(now.getTime() + 3_600_000),
        },
      ])
      .execute()

    await expect(
      unlinkMyOrganizationOidcIdentity(fixture.actor, fixture.organization.id, fixture.link.id, {
        now,
        executor: db,
      })
    ).resolves.toEqual({ ok: true, value: { ok: true } })

    const grants = await db
      .selectFrom('session_membership_authentications')
      .select(['auth_method', 'revoked_at'])
      .orderBy('auth_method')
      .execute()
    expect(grants).toEqual([
      { auth_method: 'local', revoked_at: null },
      { auth_method: 'oidc', revoked_at: now },
    ])
    await expect(
      db
        .selectFrom('oidc_identities')
        .select('id')
        .where('id', '=', fixture.identity.id)
        .executeTakeFirst()
    ).resolves.toEqual({ id: fixture.identity.id })
  })

  it('最後の利用可能な認証方式になるLinkはunlinkしない', async () => {
    const fixture = await createFixture(false)

    await expect(
      unlinkMyOrganizationOidcIdentity(fixture.actor, fixture.organization.id, fixture.link.id, {
        now,
        executor: db,
      })
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_LINK_LAST_USABLE_AUTH_METHOD' },
    })
    await expect(
      db
        .selectFrom('organization_member_oidc_identities')
        .select('revoked_at')
        .where('id', '=', fixture.link.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ revoked_at: null })
  })
})
