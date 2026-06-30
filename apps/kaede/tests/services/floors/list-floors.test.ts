import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { getFloor } from '../../../src/usecases/floors/get-floor.js'
import { listFloors } from '../../../src/usecases/floors/list-floors.js'
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

describe('listFloors', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('building 情報を含む floor 一覧を返す', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'List Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'List Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        organization_id: organization.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
        scale: 25,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listFloors(adminActor)

    expect(result.floors).toHaveLength(1)
    expect(result.floors[0]).toMatchObject({
      floor_id: floor.id,
      building_id: building.id,
      organization_id: organization.id,
      building_name: 'List Floor Building',
      level: 1,
      name: '1F',
      scale: 25,
    })
    const mapDownloadUrl = new URL(result.floors[0].map_image.download_url)
    expect(mapDownloadUrl.pathname).toBe(
      `/okarin-test/maps/${building.id}/11111111-1111-4111-8111-111111111111.png`
    )
    expect(result.floors[0].map_image.download_expires_at).toEqual(expect.any(String))
  })

  it('building 名、level、floor 名の順で並ぶ', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Sorted Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const buildingB = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'B Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const buildingA = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'A Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('floors')
      .values([
        {
          building_id: buildingB.id,
          organization_id: organization.id,
          level: 2,
          name: '2F',
          image_object_path: `maps/${buildingB.id}/22222222-2222-4222-8222-222222222222.png`,
        },
        {
          building_id: buildingA.id,
          organization_id: organization.id,
          level: 3,
          name: '3F',
          image_object_path: `maps/${buildingA.id}/33333333-3333-4333-8333-333333333333.png`,
        },
        {
          building_id: buildingA.id,
          organization_id: organization.id,
          level: 1,
          name: '1F',
          image_object_path: `maps/${buildingA.id}/44444444-4444-4444-8444-444444444444.png`,
        },
      ])
      .execute()

    const result = await listFloors(serviceClientActor)

    expect(result.floors.map((floor) => `${floor.building_name}:${floor.name}`)).toEqual([
      'A Building:1F',
      'A Building:3F',
      'B Building:2F',
    ])
  })

  it('member は所属 organization の floor だけ取得する', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const ownBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: ownOrganization.id, name: 'Own Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Other Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('floors')
      .values([
        {
          building_id: ownBuilding.id,
          organization_id: ownOrganization.id,
          level: 1,
          name: 'Own 1F',
          image_object_path: `maps/${ownBuilding.id}/11111111-1111-4111-8111-111111111111.png`,
        },
        {
          building_id: otherBuilding.id,
          organization_id: otherOrganization.id,
          level: 1,
          name: 'Other 1F',
          image_object_path: `maps/${otherBuilding.id}/22222222-2222-4222-8222-222222222222.png`,
        },
      ])
      .execute()

    const result = await listFloors(memberActor(ownOrganization.id))

    expect(result.floors).toHaveLength(1)
    expect(result.floors[0]).toMatchObject({
      organization_id: ownOrganization.id,
      name: 'Own 1F',
    })
  })

  it('manager は所属 organization の floor だけ取得する', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Own Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Other Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const ownBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: ownOrganization.id, name: 'Manager Own Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Manager Other Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('floors')
      .values([
        {
          building_id: ownBuilding.id,
          organization_id: ownOrganization.id,
          level: 1,
          name: 'Manager Own 1F',
          image_object_path: `maps/${ownBuilding.id}/33333333-3333-4333-8333-333333333333.png`,
        },
        {
          building_id: otherBuilding.id,
          organization_id: otherOrganization.id,
          level: 1,
          name: 'Manager Other 1F',
          image_object_path: `maps/${otherBuilding.id}/44444444-4444-4444-8444-444444444444.png`,
        },
      ])
      .execute()

    const result = await listFloors(managerActor(ownOrganization.id))

    expect(result.floors).toHaveLength(1)
    expect(result.floors[0]).toMatchObject({
      organization_id: ownOrganization.id,
      name: 'Manager Own 1F',
    })
  })

  it('service client は全 organization の floor を取得する', async () => {
    const organizations = await db
      .insertInto('organizations')
      .values([{ name: 'Service Floor A' }, { name: 'Service Floor B' }])
      .returning(['id'])
      .execute()

    const buildings = await db
      .insertInto('buildings')
      .values([
        { organization_id: organizations[0].id, name: 'Service Building A' },
        { organization_id: organizations[1].id, name: 'Service Building B' },
      ])
      .returning(['id'])
      .execute()

    await db
      .insertInto('floors')
      .values([
        {
          building_id: buildings[0].id,
          organization_id: organizations[0].id,
          level: 1,
          name: 'A 1F',
          image_object_path: `maps/${buildings[0].id}/11111111-1111-4111-8111-111111111111.png`,
        },
        {
          building_id: buildings[1].id,
          organization_id: organizations[1].id,
          level: 1,
          name: 'B 1F',
          image_object_path: `maps/${buildings[1].id}/22222222-2222-4222-8222-222222222222.png`,
        },
      ])
      .execute()

    const result = await listFloors(serviceClientActor)

    expect(result.floors).toHaveLength(2)
    expect(result.floors.map((floor) => floor.organization_id).sort()).toEqual(
      organizations.map((organization) => organization.id).sort()
    )
  })
})

describe('getFloor', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('member は所属 organization の floor を取得できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Get Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Get Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        organization_id: organization.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
        scale: 25,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getFloor(memberActor(organization.id), {
      floorId: floor.id,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        floor_id: floor.id,
        building_id: building.id,
        organization_id: organization.id,
        building_name: 'Get Floor Building',
        level: 1,
        name: '1F',
        scale: 25,
      },
    })
    if (!result.ok) {
      throw new Error('expected getFloor to succeed')
    }
    const mapDownloadUrl = new URL(result.value.map_image.download_url)
    expect(mapDownloadUrl.pathname).toBe(
      `/okarin-test/maps/${building.id}/11111111-1111-4111-8111-111111111111.png`
    )
    expect(result.value.map_image.download_expires_at).toEqual(expect.any(String))
  })

  it('member は所属外 organization の floor を取得できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Other Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherFloor = await db
      .insertInto('floors')
      .values({
        building_id: otherBuilding.id,
        organization_id: otherOrganization.id,
        level: 1,
        name: 'Other 1F',
        image_object_path: `maps/${otherBuilding.id}/22222222-2222-4222-8222-222222222222.png`,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getFloor(memberActor(ownOrganization.id), {
      floorId: otherFloor.id,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId: otherFloor.id,
      },
    })
  })

  it('存在しない floor は FLOOR_NOT_FOUND を返す', async () => {
    const result = await getFloor(serviceClientActor, {
      floorId: '11111111-1111-4111-8111-111111111111',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId: '11111111-1111-4111-8111-111111111111',
      },
    })
  })
})
