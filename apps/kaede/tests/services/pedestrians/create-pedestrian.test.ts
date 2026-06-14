import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { createPedestrian } from '../../../src/usecases/pedestrians/create-pedestrian.js'
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
  password_must_change: false,
  memberships: [],
}

const managerActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  password_must_change: false,
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
  password_must_change: false,
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Member Organization',
      role: 'member',
    },
  ],
})

describe('createPedestrian', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('pedestrian を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Pedestrian Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian(adminActor, {
      organization_id: organization.id,
      display_name: 'Pedestrian Test User',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
        dominant_hand: 'right',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      display_name: 'Pedestrian Test User',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
        dominant_hand: 'right',
      },
    })

    const pedestrian = await db
      .selectFrom('pedestrians')
      .selectAll()
      .where('id', '=', result.value.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.value.pedestrian_id,
      organization_id: organization.id,
      display_name: 'Pedestrian Test User',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
        dominant_hand: 'right',
      },
    })
  })

  it('任意項目を省略すると null と空 attributes で作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Minimal Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian(serviceClientActor, {
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })

    const pedestrian = await db
      .selectFrom('pedestrians')
      .selectAll()
      .where('id', '=', result.value.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.value.pedestrian_id,
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })
  })

  it('存在しない organization_id では pedestrian を作成しない', async () => {
    const organizationId = '99999999-9999-4999-8999-999999999999'

    const result = await createPedestrian(serviceClientActor, {
      organization_id: organizationId,
      display_name: 'Missing Organization Pedestrian',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId,
      },
    })

    const pedestrians = await db.selectFrom('pedestrians').select('id').execute()

    expect(pedestrians).toEqual([])
  })

  it('空白だけの display_name は DB constraint で作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Constraint Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await expect(
      createPedestrian(serviceClientActor, {
        organization_id: organization.id,
        display_name: '   ',
      })
    ).rejects.toThrow()

    const pedestrians = await db.selectFrom('pedestrians').select('id').execute()

    expect(pedestrians).toEqual([])
  })

  it('manager は所属 organization に pedestrian を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian(managerActor(organization.id), {
      organization_id: organization.id,
      display_name: 'Manager Pedestrian',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      display_name: 'Manager Pedestrian',
    })
  })

  it('manager は別 organization に pedestrian を作成できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Manager Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Manager Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian(managerActor(ownOrganization.id), {
      organization_id: otherOrganization.id,
      display_name: 'Forbidden Pedestrian',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })
  })

  it('member は pedestrian を作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Member Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian(memberActor(organization.id), {
      organization_id: organization.id,
      display_name: 'Forbidden Member Pedestrian',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })
})
