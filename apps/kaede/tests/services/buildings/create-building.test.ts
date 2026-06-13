import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { createBuilding } from '../../../src/usecases/create-building.js'
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

describe('createBuilding', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('building を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Building Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(adminActor, {
      organization_id: organization.id,
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createBuilding to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })

    const building = await db
      .selectFrom('buildings')
      .selectAll()
      .where('id', '=', result.value.building_id)
      .executeTakeFirstOrThrow()

    expect(building).toMatchObject({
      id: result.value.building_id,
      organization_id: organization.id,
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })
  })

  it('任意項目を省略すると null で作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Minimal Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(serviceClientActor, {
      organization_id: organization.id,
      name: 'Minimal Building',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createBuilding to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      name: 'Minimal Building',
      latitude: null,
      longitude: null,
    })

    const building = await db
      .selectFrom('buildings')
      .selectAll()
      .where('id', '=', result.value.building_id)
      .executeTakeFirstOrThrow()

    expect(building).toMatchObject({
      id: result.value.building_id,
      organization_id: organization.id,
      name: 'Minimal Building',
      latitude: null,
      longitude: null,
    })
  })

  it('存在しない organization_id では building を作成しない', async () => {
    const organizationId = '99999999-9999-4999-8999-999999999999'

    const result = await createBuilding(serviceClientActor, {
      organization_id: organizationId,
      name: 'Missing Organization Building',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId,
      },
    })

    const buildings = await db.selectFrom('buildings').select('id').execute()

    expect(buildings).toEqual([])
  })

  it('name がない場合は DB constraint で作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Constraint Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await expect(
      createBuilding(serviceClientActor, {
        organization_id: organization.id,
        // route validation normally rejects this before usecase execution.
        name: undefined as unknown as string,
      })
    ).rejects.toThrow()

    const buildings = await db.selectFrom('buildings').select('id').execute()

    expect(buildings).toEqual([])
  })

  it('manager は所属 organization に building を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(managerActor(organization.id), {
      organization_id: organization.id,
      name: 'Manager Building',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createBuilding to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      name: 'Manager Building',
    })
  })

  it('manager は別 organization に building を作成できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Manager Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Manager Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(managerActor(ownOrganization.id), {
      organization_id: otherOrganization.id,
      name: 'Forbidden Building',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })
  })

  it('member は building を作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Member Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(memberActor(organization.id), {
      organization_id: organization.id,
      name: 'Forbidden Member Building',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })
})
