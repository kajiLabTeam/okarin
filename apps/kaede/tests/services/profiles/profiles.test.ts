import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { findMemberProfileContextByUser } from '../../../src/services/profiles/index.js'
import {
  getMyOrganizationMemberProfile,
  updateOrganizationMemberProfile,
} from '../../../src/usecases/profiles/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const createUser = async (email: string, displayName: string) =>
  db
    .insertInto('users')
    .values({
      email,
      display_name: displayName,
      password_hash: null,
      global_role: 'none',
      status: 'active',
      password_changed_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

describe('profile usecases with database', () => {
  beforeEach(async () => resetDatabase(db))
  afterAll(async () => db.destroy())

  it('override未設定時はUser Profileへfallbackする', async () => {
    const user = await createUser('self-profile@example.com', 'Legacy')
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Profile Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const membership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('user_profiles')
      .values({
        user_id: user.id,
        display_name: 'Global Profile',
        locale: 'ja-JP',
        timezone: 'Asia/Tokyo',
      })
      .execute()

    const actor: RequestActor = {
      type: 'user',
      user_id: user.id,
      email: user.email,
      global_role: 'none',
      account_state: 'active',
      memberships: [
        { organization_id: organization.id, organization_name: organization.name, role: 'member' },
      ],
    }

    const result = await getMyOrganizationMemberProfile(actor, organization.id)

    expect(result).toMatchObject({
      ok: true,
      value: {
        membership_id: membership.id,
        global: { display_name: 'Global Profile' },
        override: { display_name: null, height_meters: null, stride_length_meters: null },
        effective: { display_name: 'Global Profile', display_name_source: 'global' },
      },
    })
  })

  it('managerによるmember Profile変更とAudit Eventを同時に保存する', async () => {
    const manager = await createUser('profile-manager@example.com', 'Manager')
    const member = await createUser('profile-member@example.com', 'Member')
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Managed Profile Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const managerMembership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organization.id, user_id: manager.id, role: 'manager' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const memberMembership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organization.id, user_id: member.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()
    if (!managerMembership.id || !memberMembership.id) {
      throw new Error('membership ids must be populated')
    }
    await db
      .insertInto('user_profiles')
      .values([
        {
          user_id: manager.id,
          display_name: 'Manager',
          locale: 'ja-JP',
          timezone: 'Asia/Tokyo',
        },
        {
          user_id: member.id,
          display_name: 'Member',
          locale: 'ja-JP',
          timezone: 'Asia/Tokyo',
        },
      ])
      .execute()

    const actor: RequestActor = {
      type: 'user',
      user_id: manager.id,
      email: manager.email,
      global_role: 'none',
      account_state: 'active',
      memberships: [
        {
          organization_id: organization.id,
          organization_name: organization.name,
          role: 'manager',
        },
      ],
    }

    const result = await updateOrganizationMemberProfile(
      actor,
      organization.id,
      memberMembership.id,
      { display_name: 'Managed Member', height_meters: 1.705, stride_length_meters: 0.72 }
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        effective: {
          display_name: 'Managed Member',
          display_name_source: 'organization_override',
        },
        update_context: { kind: 'forced', actor_role: 'manager' },
      },
    })

    const storedProfile = await db
      .selectFrom('organization_member_profiles')
      .selectAll()
      .where('membership_id', '=', memberMembership.id)
      .executeTakeFirstOrThrow()
    expect(storedProfile.display_name).toBe('Managed Member')
    expect(Number(storedProfile.height_meters)).toBe(1.705)
    expect(Number(storedProfile.stride_length_meters)).toBe(0.72)

    const audit = await db
      .selectFrom('audit_events')
      .selectAll()
      .where('target_id', '=', memberMembership.id)
      .executeTakeFirstOrThrow()
    expect(audit.actor_membership_id).toBe(managerMembership.id)
    expect(audit.changed_fields).toEqual(['display_name', 'height_meters', 'stride_length_meters'])
  })

  it('再参加でleftとactive Membershipが併存するときcurrent Membershipを選ぶ', async () => {
    const user = await createUser('rejoined-profile@example.com', 'Rejoined Member')
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Rejoined Profile Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()

    await db
      .transaction()
      .execute(async (trx) => {
        await sql`ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_pkey`.execute(
          trx
        )

        const leftMembership = await trx
          .insertInto('organization_memberships')
          .values({
            organization_id: organization.id,
            user_id: user.id,
            role: 'member',
            status: 'left',
            left_at: new Date('2026-08-10T00:00:00.000Z'),
          })
          .returningAll()
          .executeTakeFirstOrThrow()
        const activeMembership = await trx
          .insertInto('organization_memberships')
          .values({
            organization_id: organization.id,
            user_id: user.id,
            role: 'member',
            status: 'active',
          })
          .returningAll()
          .executeTakeFirstOrThrow()

        const selected = await findMemberProfileContextByUser(organization.id, user.id, trx)

        expect(selected?.membership_id).toBe(activeMembership.id)
        expect(selected?.membership_id).not.toBe(leftMembership.id)
        expect(selected?.status).toBe('active')

        throw new Error('rollback rejoined membership test')
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== 'rollback rejoined membership test') {
          throw error
        }
      })
  })
})
