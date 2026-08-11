import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { updateOrganizationMembership } from '../../../src/usecases/membership-administration/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T12:00:00.000Z')

const actor = (userId: string, organizationId: string, role: 'member' | 'manager' | 'owner') =>
  ({
    type: 'user',
    user_id: userId,
    email: `${userId}@example.test`,
    global_role: 'none',
    account_state: 'active',
    memberships: [{ organization_id: organizationId, organization_name: 'Test', role }],
  }) satisfies RequestActor

const createUser = (suffix: string) =>
  db
    .insertInto('users')
    .values({
      email: `${suffix}@example.test`,
      display_name: suffix,
      global_role: 'none',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()

const createFixture = async (actorRole: 'manager' | 'owner' = 'manager') => {
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Membership Administration' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const actorUser = await createUser('membership-admin-actor')
  const targetUser = await createUser('membership-admin-target')
  const actorMembership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, user_id: actorUser.id, role: actorRole })
    .returningAll()
    .executeTakeFirstOrThrow()
  const targetMembership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, user_id: targetUser.id, role: 'member' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const credential = await db
    .insertInto('organization_local_credentials')
    .values({
      membership_id: targetMembership.id,
      organization_id: organization.id,
      login_email: 'membership-target@example.test',
      normalized_login_email: 'membership-target@example.test',
      password_hash: 'test-password-hash',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const { session } = await createSession({ userId: targetUser.id, now }, db)
  await db
    .insertInto('session_membership_authentications')
    .values({
      session_id: session.id,
      membership_id: targetMembership.id,
      user_id: targetUser.id,
      auth_method: 'local',
      policy_version: 1,
      local_credential_id: credential.id,
      authenticated_at: now,
      expires_at: new Date(now.getTime() + 3_600_000),
    })
    .execute()

  return {
    actor: actor(actorUser.id, organization.id, actorRole),
    actorMembership,
    credential,
    organization,
    targetMembership,
    targetUser,
  }
}

describe('membership administration', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('managerはmemberをsuspendでき、対象Grantだけをrevokeする', async () => {
    const fixture = await createFixture()

    const result = await updateOrganizationMembership(
      fixture.actor,
      fixture.organization.id,
      fixture.targetMembership.id,
      { status: 'suspended' },
      now,
      db
    )

    expect(result).toMatchObject({ ok: true, value: { status: 'suspended', left_at: null } })
    await expect(
      db
        .selectFrom('session_membership_authentications')
        .select('revoked_at')
        .where('membership_id', '=', fixture.targetMembership.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ revoked_at: now })
    await expect(
      db
        .selectFrom('organization_local_credentials')
        .select('enabled')
        .where('id', '=', fixture.credential.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ enabled: true })
  })

  it('managerはmemberをmanagerへ昇格できない', async () => {
    const fixture = await createFixture()

    const result = await updateOrganizationMembership(
      fixture.actor,
      fixture.organization.id,
      fixture.targetMembership.id,
      { role: 'manager' },
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'MEMBERSHIP_ROLE_FORBIDDEN' } })
  })

  it('ownerがmemberをleftにするとleft_atを設定し認証元も無効化する', async () => {
    const fixture = await createFixture('owner')

    const result = await updateOrganizationMembership(
      fixture.actor,
      fixture.organization.id,
      fixture.targetMembership.id,
      { status: 'left' },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'left', left_at: now.toISOString() },
    })
    await expect(
      db
        .selectFrom('organization_local_credentials')
        .select('enabled')
        .where('id', '=', fixture.credential.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ enabled: false })
    const audit = await db
      .selectFrom('audit_events')
      .select(['actor_membership_id', 'target_id', 'changed_fields'])
      .executeTakeFirstOrThrow()
    expect(audit).toEqual({
      actor_membership_id: fixture.actorMembership.id,
      target_id: fixture.targetMembership.id,
      changed_fields: ['status'],
    })
  })

  it('最後のactive ownerはsuspendできない', async () => {
    const fixture = await createFixture('owner')

    const result = await updateOrganizationMembership(
      fixture.actor,
      fixture.organization.id,
      fixture.actorMembership.id,
      { status: 'suspended' },
      now,
      db
    )

    expect(result).toEqual({ ok: false, error: { type: 'MEMBERSHIP_LAST_OWNER' } })
  })

  it('別のactive ownerがいればownerをmanagerへ変更できる', async () => {
    const fixture = await createFixture('owner')
    const secondOwnerUser = await createUser('second-owner')
    await db
      .insertInto('organization_memberships')
      .values({
        organization_id: fixture.organization.id,
        user_id: secondOwnerUser.id,
        role: 'owner',
      })
      .execute()

    const result = await updateOrganizationMembership(
      fixture.actor,
      fixture.organization.id,
      fixture.actorMembership.id,
      { role: 'manager' },
      now,
      db
    )

    expect(result).toMatchObject({ ok: true, value: { role: 'manager', status: 'active' } })
  })
})
