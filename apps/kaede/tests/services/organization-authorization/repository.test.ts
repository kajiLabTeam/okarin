import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findMembershipGrantContext,
  listMembershipGrantContexts,
} from '../../../src/services/organization-authorization/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

describe('organization authorization repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('left Membershipを除外し、再参加後のcurrent active Membershipだけを返す', async () => {
    const user = await db
      .insertInto('users')
      .values({
        email: 'grant-current@example.com',
        display_name: 'Grant Current',
        password_hash: passwordHash,
        global_role: 'none',
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const [leftOrganization, activeOrganization] = await db
      .insertInto('organizations')
      .values([{ name: 'Left Organization' }, { name: 'Active Organization' }])
      .returningAll()
      .execute()
    const [leftMembership, activeMembership] = await db
      .insertInto('organization_memberships')
      .values([
        {
          organization_id: leftOrganization.id,
          user_id: user.id,
          role: 'member',
          status: 'left',
          left_at: new Date('2026-08-10T00:00:00.000Z'),
        },
        {
          organization_id: activeOrganization.id,
          user_id: user.id,
          role: 'manager',
          status: 'active',
        },
      ])
      .returningAll()
      .execute()
    await db
      .insertInto('organization_auth_settings')
      .values([
        {
          organization_id: leftOrganization.id,
          local_auth_enabled: true,
          oidc_auth_enabled: false,
          membership_grant_ttl_seconds: 7200,
          reauthentication_interval_seconds: 3600,
        },
        {
          organization_id: activeOrganization.id,
          local_auth_enabled: true,
          oidc_auth_enabled: false,
          membership_grant_ttl_seconds: 7200,
          reauthentication_interval_seconds: 3600,
        },
      ])
      .execute()
    const session = await db
      .insertInto('sessions')
      .values({
        user_id: user.id,
        session_hash: 'current-membership-session',
        expires_at: new Date('2026-08-13T00:00:00.000Z'),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      findMembershipGrantContext(session.id, user.id, leftOrganization.id, db)
    ).resolves.toBeUndefined()
    const contexts = await listMembershipGrantContexts(session.id, user.id, db)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({
      organization_id: activeOrganization.id,
      membership_id: activeMembership.id,
      membership_status: 'active',
    })
    expect(contexts[0]?.membership_id).not.toBe(leftMembership.id)
  })

  it('Auth Settingsがないcurrent Membershipも落とさず明示contextで返す', async () => {
    const user = await db
      .insertInto('users')
      .values({
        email: 'missing-settings@example.com',
        display_name: 'Missing Settings',
        password_hash: passwordHash,
        global_role: 'none',
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Missing Settings Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const membership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const session = await db
      .insertInto('sessions')
      .values({
        user_id: user.id,
        session_hash: 'missing-settings-session',
        expires_at: new Date('2026-08-13T00:00:00.000Z'),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      findMembershipGrantContext(session.id, user.id, organization.id, db)
    ).resolves.toMatchObject({
      organization_id: organization.id,
      organization_name: organization.name,
      organization_slug: organization.slug,
      membership_id: membership.id,
      auth_settings_available: false,
      local_auth_enabled: null,
      oidc_auth_enabled: null,
    })
  })
})
