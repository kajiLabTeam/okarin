import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { createBuilding } from '../../../src/usecases/buildings/create-building.js'
import { getBuilding } from '../../../src/usecases/buildings/get-building.js'
import { listBuildings } from '../../../src/usecases/buildings/list-buildings.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

afterAll(async () => {
  await db.destroy()
})

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

describe('createBuilding', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('building を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Building Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createBuilding(adminActor, organization.id, {
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

    const result = await createBuilding(serviceClientActor, organization.id, {
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

    const result = await createBuilding(serviceClientActor, organizationId, {
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
      createBuilding(serviceClientActor, organization.id, {
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

    const result = await createBuilding(managerActor(organization.id), organization.id, {
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

    const result = await createBuilding(managerActor(ownOrganization.id), otherOrganization.id, {
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

    const result = await createBuilding(memberActor(organization.id), organization.id, {
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

describe('listBuildings', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('admin は全 organization の building を取得する', async () => {
    const organizations = await db
      .insertInto('organizations')
      .values([{ name: 'Building A Organization' }, { name: 'Building B Organization' }])
      .returning(['id'])
      .execute()
    await db
      .insertInto('buildings')
      .values([
        { organization_id: organizations[1].id, name: 'B Building' },
        { organization_id: organizations[0].id, name: 'A Building' },
      ])
      .execute()

    const result = await listBuildings(adminActor)

    expect(result.buildings).toHaveLength(2)
    expect(result.buildings.map((building) => building.name)).toEqual(['A Building', 'B Building'])
  })

  it('member は所属 organization の building だけ取得する', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    await db
      .insertInto('buildings')
      .values([
        { organization_id: ownOrganization.id, name: 'Own Building' },
        { organization_id: otherOrganization.id, name: 'Other Building' },
      ])
      .execute()

    const result = await listBuildings(memberActor(ownOrganization.id))

    expect(result.buildings).toHaveLength(1)
    expect(result.buildings[0]).toMatchObject({
      organization_id: ownOrganization.id,
      name: 'Own Building',
    })
  })

  it('service client は全 organization の building を取得する', async () => {
    const organizations = await db
      .insertInto('organizations')
      .values([{ name: 'Service Building A' }, { name: 'Service Building B' }])
      .returning(['id'])
      .execute()
    await db
      .insertInto('buildings')
      .values([
        { organization_id: organizations[0].id, name: 'Service Building A' },
        { organization_id: organizations[1].id, name: 'Service Building B' },
      ])
      .execute()

    const result = await listBuildings(serviceClientActor)

    expect(result.buildings).toHaveLength(2)
  })
})

describe('getBuilding', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('member は所属 organization の building を取得できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Get Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({
        organization_id: organization.id,
        name: 'Get Building',
        latitude: 35.681236,
        longitude: 139.767125,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getBuilding(memberActor(organization.id), {
      buildingId: building.id,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        building_id: building.id,
        organization_id: organization.id,
        name: 'Get Building',
        latitude: 35.681236,
        longitude: 139.767125,
      },
    })
  })

  it('member は所属外 organization の building を取得できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Get Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Get Building Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherBuilding = await db
      .insertInto('buildings')
      .values({
        organization_id: otherOrganization.id,
        name: 'Other Building',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getBuilding(memberActor(ownOrganization.id), {
      buildingId: otherBuilding.id,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId: otherBuilding.id,
      },
    })
  })

  it('存在しない building は BUILDING_NOT_FOUND を返す', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'

    const result = await getBuilding(serviceClientActor, {
      buildingId,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    })
  })
})
