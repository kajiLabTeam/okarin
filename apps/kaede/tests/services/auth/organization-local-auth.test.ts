import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../../../src/services/auth/password.js'
import { createSession } from '../../../src/services/auth/session-repository.js'
import { createDb } from '../../../src/services/db/client.js'
import { loginToOrganizationWithLocalCredential } from '../../../src/usecases/organization-local-auth/login.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T10:00:00.000Z')

const createLocalMembership = async ({
  organizationName,
  organizationSlug,
  legacyEmail,
  loginEmail,
  password,
  contactEmail = null,
}: {
  organizationName: string
  organizationSlug: string
  legacyEmail: string
  loginEmail: string
  password: string
  contactEmail?: string | null
}) => {
  const user = await db
    .insertInto('users')
    .values({
      email: legacyEmail,
      contact_email: contactEmail,
      normalized_contact_email: contactEmail,
      display_name: legacyEmail,
      password_hash: null,
      global_role: 'none',
      status: 'active',
      password_changed_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: organizationName, slug: organizationSlug })
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
  if (!membership.id) throw new Error('membership id is required')
  const credential = await db
    .insertInto('organization_local_credentials')
    .values({
      membership_id: membership.id,
      organization_id: organization.id,
      login_email: loginEmail,
      normalized_login_email: loginEmail.trim().toLowerCase(),
      password_hash: await hashPassword(password),
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return { credential, membership: { ...membership, id: membership.id }, organization, user }
}

describe('organization local authentication', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('Organizationと正規化emailでCredentialを検索し、Sessionと対象Grantを作る', async () => {
    const fixture = await createLocalMembership({
      organizationName: 'Organization A',
      organizationSlug: 'organization-a',
      legacyEmail: 'legacy@example.test',
      contactEmail: 'LOCAL@EXAMPLE.TEST',
      loginEmail: 'local@example.test',
      password: 'organization-a-password',
    })

    const result = await loginToOrganizationWithLocalCredential(
      'organization-a',
      undefined,
      {
        login_email: '  LOCAL@example.test  ',
        password: 'organization-a-password',
        return_to: '/orgs/organization-a/dashboard',
      },
      {},
      now,
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionToken).toBeDefined()
    expect(result.value.membership.id).toBe(fixture.membership.id)
    expect(result.value.grant).toEqual({
      auth_method: 'local',
      authenticated_at: now.toISOString(),
      expires_at: '2026-08-11T18:00:00.000Z',
    })

    const grant = await db
      .selectFrom('session_membership_authentications')
      .selectAll()
      .where('membership_id', '=', fixture.membership.id)
      .executeTakeFirstOrThrow()
    expect(grant.user_id).toBe(fixture.user.id)
    expect(grant.local_credential_id).toBe(fixture.credential.id)
    expect(grant.policy_version).toBe('1')
    await expect(
      db.selectFrom('authentication_events').selectAll().execute()
    ).resolves.toMatchObject([{ outcome: 'success', event_type: 'local_login' }])
  })

  it('同じlogin emailでもOrganizationごとのpasswordを分離する', async () => {
    await createLocalMembership({
      organizationName: 'Organization A',
      organizationSlug: 'organization-a',
      legacyEmail: 'a@example.test',
      loginEmail: 'shared@example.test',
      password: 'organization-a-password',
    })
    const organizationB = await createLocalMembership({
      organizationName: 'Organization B',
      organizationSlug: 'organization-b',
      legacyEmail: 'b@example.test',
      loginEmail: 'shared@example.test',
      password: 'organization-b-password',
    })

    const result = await loginToOrganizationWithLocalCredential(
      'organization-b',
      undefined,
      {
        login_email: 'shared@example.test',
        password: 'organization-a-password',
        return_to: '/orgs/organization-b',
      },
      {},
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_INVALID_CREDENTIALS' } })
    const credential = await db
      .selectFrom('organization_local_credentials')
      .selectAll()
      .where('id', '=', organizationB.credential.id)
      .executeTakeFirstOrThrow()
    expect(credential.failed_login_attempts).toBe(1)
  })

  it('User contact_emailをLocal認証の検索キーにしない', async () => {
    await createLocalMembership({
      organizationName: 'Contact Organization',
      organizationSlug: 'contact-organization',
      legacyEmail: 'legacy-contact@example.test',
      contactEmail: 'contact@example.test',
      loginEmail: 'local-login@example.test',
      password: 'local-password',
    })

    const result = await loginToOrganizationWithLocalCredential(
      'contact-organization',
      undefined,
      {
        login_email: 'contact@example.test',
        password: 'local-password',
        return_to: '/orgs/contact-organization',
      },
      {},
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_INVALID_CREDENTIALS' } })
  })

  it('既存SessionのUserが一致すればSessionを維持し対象Membership Grantだけ追加する', async () => {
    const organizationA = await createLocalMembership({
      organizationName: 'Organization A',
      organizationSlug: 'organization-a',
      legacyEmail: 'same-user@example.test',
      loginEmail: 'a-login@example.test',
      password: 'password-a',
    })
    const organizationB = await db
      .insertInto('organizations')
      .values({ name: 'Organization B', slug: 'organization-b' })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('organization_auth_settings')
      .values({
        organization_id: organizationB.id,
        local_auth_enabled: true,
        oidc_auth_enabled: false,
        membership_grant_ttl_seconds: 28_800,
        reauthentication_interval_seconds: 14_400,
      })
      .execute()
    const membershipB = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organizationB.id, user_id: organizationA.user.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()
    if (!membershipB.id) throw new Error('membership id is required')
    await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: membershipB.id,
        organization_id: organizationB.id,
        login_email: 'b-login@example.test',
        normalized_login_email: 'b-login@example.test',
        password_hash: await hashPassword('password-b'),
      })
      .execute()
    const existingSession = await createSession({ userId: organizationA.user.id, now }, db)

    const result = await loginToOrganizationWithLocalCredential(
      'organization-b',
      existingSession.token,
      {
        login_email: 'b-login@example.test',
        password: 'password-b',
        return_to: '/orgs/organization-b',
      },
      {},
      now,
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionToken).toBeUndefined()
    expect(result.value.session.id).toBe(existingSession.session.id)
    const grants = await db
      .selectFrom('session_membership_authentications')
      .select(['membership_id'])
      .where('session_id', '=', existingSession.session.id)
      .execute()
    expect(grants).toEqual([{ membership_id: membershipB.id }])
  })

  it('既存SessionとCredentialのUserが異なる場合は拒否してGrantを作らない', async () => {
    const sessionOwner = await createLocalMembership({
      organizationName: 'Session Organization',
      organizationSlug: 'session-organization',
      legacyEmail: 'session-owner@example.test',
      loginEmail: 'session-login@example.test',
      password: 'session-password',
    })
    await createLocalMembership({
      organizationName: 'Target Organization',
      organizationSlug: 'target-organization',
      legacyEmail: 'target-owner@example.test',
      loginEmail: 'target-login@example.test',
      password: 'target-password',
    })
    const session = await createSession({ userId: sessionOwner.user.id, now }, db)

    const result = await loginToOrganizationWithLocalCredential(
      'target-organization',
      session.token,
      {
        login_email: 'target-login@example.test',
        password: 'target-password',
        return_to: '/orgs/target-organization',
      },
      {},
      now,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
    })
    await expect(
      db.selectFrom('session_membership_authentications').selectAll().execute()
    ).resolves.toEqual([])
  })

  it('失敗回数とlockoutはCredential単位で更新する', async () => {
    const fixture = await createLocalMembership({
      organizationName: 'Lock Organization',
      organizationSlug: 'lock-organization',
      legacyEmail: 'lock@example.test',
      loginEmail: 'lock-login@example.test',
      password: 'correct-password',
    })
    await db
      .updateTable('organization_local_credentials')
      .set({ failed_login_attempts: 4 })
      .where('id', '=', fixture.credential.id)
      .execute()

    const result = await loginToOrganizationWithLocalCredential(
      'lock-organization',
      undefined,
      {
        login_email: 'lock-login@example.test',
        password: 'wrong-password',
        return_to: '/orgs/lock-organization',
      },
      {},
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_CREDENTIAL_LOCKED' } })
    const credential = await db
      .selectFrom('organization_local_credentials')
      .selectAll()
      .where('id', '=', fixture.credential.id)
      .executeTakeFirstOrThrow()
    expect(credential.failed_login_attempts).toBe(5)
    expect(credential.locked_until).toEqual(new Date('2026-08-11T10:15:00.000Z'))
  })

  it('Organization policyでLocal認証が無効ならCredentialを使用しない', async () => {
    const fixture = await createLocalMembership({
      organizationName: 'OIDC Organization',
      organizationSlug: 'oidc-organization',
      legacyEmail: 'oidc@example.test',
      loginEmail: 'oidc-login@example.test',
      password: 'local-password',
    })
    await db
      .updateTable('organization_auth_settings')
      .set({ local_auth_enabled: false, oidc_auth_enabled: true })
      .where('organization_id', '=', fixture.organization.id)
      .execute()

    const result = await loginToOrganizationWithLocalCredential(
      'oidc-organization',
      undefined,
      {
        login_email: 'oidc-login@example.test',
        password: 'local-password',
        return_to: '/orgs/oidc-organization',
      },
      {},
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_METHOD_NOT_ALLOWED' } })
  })
})
