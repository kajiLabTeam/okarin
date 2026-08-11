import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findOrganizationMembership,
  upsertOrganizationMembership,
} from '../../../src/services/users/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const createUserAndOrganization = async () => {
  const user = await db
    .insertInto('users')
    .values({
      email: 'membership-lifecycle@example.test',
      display_name: 'Membership Lifecycle',
      global_role: 'none',
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Membership Lifecycle Organization' })
    .returningAll()
    .executeTakeFirstOrThrow()

  return { organization, user }
}

describe('membership lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('UUIDをprimary keyとし、current MembershipだけをUserとOrganizationごとに一意にする', async () => {
    const primaryKeyColumns = await sql<{ column_name: string }>`
      SELECT attribute.attname AS column_name
      FROM pg_constraint AS con
      JOIN pg_class AS relation ON relation.oid = con.conrelid
      JOIN unnest(con.conkey) WITH ORDINALITY AS key(attnum, position) ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum = key.attnum
      WHERE relation.relname = 'organization_memberships'
        AND con.contype = 'p'
      ORDER BY key.position
    `.execute(db)

    expect(primaryKeyColumns.rows.map((row) => row.column_name)).toEqual(['id'])

    const index = await sql<{ predicate: string | null }>`
      SELECT pg_get_expr(idx.indpred, idx.indrelid) AS predicate
      FROM pg_index AS idx
      JOIN pg_class AS relation ON relation.oid = idx.indexrelid
      WHERE relation.relname = 'organization_memberships_current_user_org_key'
    `.execute(db)

    expect(index.rows[0]?.predicate).toContain('status = ANY')
  })

  it('left後の再参加では新しいMembershipを作成する', async () => {
    const { organization, user } = await createUserAndOrganization()
    const leftMembership = await db
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

    const currentMembership = await upsertOrganizationMembership(
      {
        organization_id: organization.id,
        user_id: user.id,
        role: 'manager',
        status: 'active',
      },
      db
    )

    expect(currentMembership.id).not.toBe(leftMembership.id)
    await expect(findOrganizationMembership(organization.id, user.id, db)).resolves.toMatchObject({
      id: currentMembership.id,
      role: 'manager',
      status: 'active',
    })
    await expect(
      db
        .selectFrom('organization_memberships')
        .selectAll()
        .where('organization_id', '=', organization.id)
        .where('user_id', '=', user.id)
        .execute()
    ).resolves.toHaveLength(2)
  })

  it('current Membershipがある場合は新規行を作らずroleを更新する', async () => {
    const { organization, user } = await createUserAndOrganization()
    const original = await upsertOrganizationMembership(
      {
        organization_id: organization.id,
        user_id: user.id,
        role: 'member',
        status: 'active',
      },
      db
    )
    const updated = await upsertOrganizationMembership(
      {
        organization_id: organization.id,
        user_id: user.id,
        role: 'manager',
        status: 'active',
      },
      db
    )

    expect(updated.id).toBe(original.id)
    expect(updated.role).toBe('manager')
  })
})
