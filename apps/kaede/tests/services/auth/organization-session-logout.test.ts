import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { logoutFromOrganization } from '../../../src/usecases/organization-session-auth/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T12:00:00.000Z')

const createGrantFixture = async () => {
  const user = await db
    .insertInto('users')
    .values({
      email: 'organization-logout@example.test',
      display_name: 'Organization Logout',
      global_role: 'none',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organizations = await db
    .insertInto('organizations')
    .values([{ name: 'Organization A' }, { name: 'Organization B' }])
    .returningAll()
    .execute()
  const memberships = await Promise.all(
    organizations.map((organization) =>
      db
        .insertInto('organization_memberships')
        .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
        .returningAll()
        .executeTakeFirstOrThrow()
    )
  )
  const credentials = await Promise.all(
    memberships.map((membership, index) =>
      db
        .insertInto('organization_local_credentials')
        .values({
          membership_id: membership.id,
          organization_id: membership.organization_id,
          login_email: `logout-${index}@example.test`,
          normalized_login_email: `logout-${index}@example.test`,
          password_hash: 'test-password-hash',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    )
  )
  const { session, token } = await createSession({ userId: user.id, now }, db)
  await db
    .insertInto('session_membership_authentications')
    .values(
      memberships.map((membership, index) => ({
        session_id: session.id,
        membership_id: membership.id,
        user_id: user.id,
        auth_method: 'local',
        policy_version: 1,
        local_credential_id: credentials[index].id,
        authenticated_at: now,
        expires_at: new Date(now.getTime() + 3_600_000),
      }))
    )
    .execute()

  return { memberships, organizations, session, token }
}

describe('organization session logout', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('対象OrganizationのGrantだけをrevokeし、Sessionと他Organization Grantを維持する', async () => {
    const fixture = await createGrantFixture()
    const targetOrganization = fixture.organizations[0]
    const targetMembership = fixture.memberships[0]

    const result = await logoutFromOrganization(
      targetOrganization.id,
      fixture.token,
      { now, requestId: 'request-id', userAgent: 'test-agent' },
      db
    )

    expect(result).toEqual({
      ok: true,
      value: {
        organization_id: targetOrganization.id,
        membership_id: targetMembership.id,
        revoked: true,
      },
    })
    const grants = await db
      .selectFrom('session_membership_authentications')
      .select(['membership_id', 'revoked_at'])
      .where('session_id', '=', fixture.session.id)
      .orderBy('membership_id')
      .execute()
    expect(grants.find((grant) => grant.membership_id === targetMembership.id)?.revoked_at).toEqual(
      now
    )
    expect(
      grants.find((grant) => grant.membership_id !== targetMembership.id)?.revoked_at
    ).toBeNull()
    await expect(
      db
        .selectFrom('sessions')
        .select('revoked_at')
        .where('id', '=', fixture.session.id)
        .executeTakeFirst()
    ).resolves.toEqual({ revoked_at: null })
  })

  it('既にrevoke済みまたはGrantなしでもidempotentに成功する', async () => {
    const fixture = await createGrantFixture()
    const targetOrganization = fixture.organizations[0]

    await logoutFromOrganization(targetOrganization.id, fixture.token, { now }, db)
    const second = await logoutFromOrganization(
      targetOrganization.id,
      fixture.token,
      { now: new Date(now.getTime() + 1000) },
      db
    )

    expect(second).toMatchObject({ ok: true, value: { revoked: false } })
  })

  it('current MembershipがないOrganizationは拒否してGrantを変更しない', async () => {
    const fixture = await createGrantFixture()
    const unrelated = await db
      .insertInto('organizations')
      .values({ name: 'Unrelated Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()

    const result = await logoutFromOrganization(unrelated.id, fixture.token, { now }, db)

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' } })
    const revokedCount = await db
      .selectFrom('session_membership_authentications')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('revoked_at', 'is not', null)
      .executeTakeFirstOrThrow()
    expect(revokedCount.count.toString()).toBe('0')
  })
})
