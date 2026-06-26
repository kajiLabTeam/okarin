import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { createFloor } from '../../../src/usecases/floors/create-floor.js'
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

describe('createFloor', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('building に紐づく floor を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Floor Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Floor Test Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(adminActor, organization.id, building.id, {
      level: 2,
      name: '2F',
      scale: 25,
      map_image_extension: 'svg',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createFloor to succeed')
    }

    expect(result.value).toMatchObject({
      building_id: building.id,
      organization_id: organization.id,
      building_name: 'Floor Test Building',
      level: 2,
      name: '2F',
      scale: 25,
    })

    const floor = await db
      .selectFrom('floors')
      .selectAll()
      .where('id', '=', result.value.floor_id)
      .executeTakeFirstOrThrow()

    expect(floor).toMatchObject({
      id: result.value.floor_id,
      building_id: building.id,
      organization_id: organization.id,
      level: 2,
      name: '2F',
      scale: 25,
      image_object_path: `maps/${building.id}/${result.value.floor_id}.svg`,
    })
  })

  it('存在しない building_id では floor を作成しない', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'

    const result = await createFloor(
      serviceClientActor,
      '99999999-9999-4999-8999-999999999999',
      buildingId,
      {
        level: 1,
        name: '1F',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    })

    const floors = await db.selectFrom('floors').select('id').execute()

    expect(floors).toEqual([])
  })

  it('manager は所属 organization の building に floor を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Manager Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(managerActor(organization.id), organization.id, building.id, {
      level: 3,
      name: '3F',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createFloor to succeed')
    }

    expect(result.value).toMatchObject({
      building_id: building.id,
      organization_id: organization.id,
      name: '3F',
    })
  })

  it('manager は別 organization の building に floor を作成できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Other Manager Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      managerActor(ownOrganization.id),
      ownOrganization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId: building.id,
      },
    })
  })

  it('member は floor を作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Member Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Member Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(memberActor(organization.id), organization.id, building.id, {
      level: 1,
      name: '1F',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })
})
