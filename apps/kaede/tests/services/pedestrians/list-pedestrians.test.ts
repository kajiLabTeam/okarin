import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { listPedestrians } from '../../../src/usecases/pedestrians/list-pedestrians.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const adminActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  global_role: 'admin',
  account_state: 'active',
  memberships: [],
}

const managerActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Manager Organization',
      role: 'manager',
    },
  ],
})

const memberActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'member@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Member Organization',
      role: 'member',
    },
  ],
})

describe('listPedestrians', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('pedestrian 一覧を返す', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'List Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const pedestrian = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'List Pedestrian',
        height: 1.72,
        stride_length: 0.7,
        attributes: {
          device: 'Pixel 8',
        },
        user_id: null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listPedestrians(adminActor)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected listPedestrians to succeed')
    }

    expect(result.value.pedestrians).toHaveLength(1)
    expect(result.value.pedestrians[0]).toMatchObject({
      pedestrian_id: pedestrian.id,
      organization_id: organization.id,
      display_name: 'List Pedestrian',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
      },
    })
  })

  it('作成日時、ID の順で並ぶ', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Ordering Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const older = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'Older Pedestrian',
        created_at: new Date('2026-05-13T00:00:00.000Z'),
        updated_at: new Date('2026-05-13T00:00:00.000Z'),
        user_id: null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const newer = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'Newer Pedestrian',
        created_at: new Date('2026-05-14T00:00:00.000Z'),
        updated_at: new Date('2026-05-14T00:00:00.000Z'),
        user_id: null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listPedestrians(serviceClientActor)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected listPedestrians to succeed')
    }

    expect(result.value.pedestrians.map((pedestrian) => pedestrian.pedestrian_id)).toEqual([
      older.id,
      newer.id,
    ])
  })

  it('manager は所属 organization の pedestrians だけ取得する', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('pedestrians')
      .values([
        {
          organization_id: ownOrganization.id,
          display_name: 'Own Pedestrian',
          user_id: null,
        },
        {
          organization_id: otherOrganization.id,
          display_name: 'Other Pedestrian',
          user_id: null,
        },
      ])
      .execute()

    const result = await listPedestrians(managerActor(ownOrganization.id))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected listPedestrians to succeed')
    }

    expect(result.value.pedestrians).toHaveLength(1)
    expect(result.value.pedestrians[0]).toMatchObject({
      organization_id: ownOrganization.id,
      display_name: 'Own Pedestrian',
    })
  })

  it('member は dashboard pedestrian 一覧を取得できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Member Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listPedestrians(memberActor(organization.id))

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })
})
