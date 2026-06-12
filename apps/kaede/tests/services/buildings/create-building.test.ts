import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { createBuilding } from '../../../src/usecases/create-building.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

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

    const result = await createBuilding({
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

    const result = await createBuilding({
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

    const result = await createBuilding({
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
      createBuilding({
        organization_id: organization.id,
        // route validation normally rejects this before usecase execution.
        name: undefined as unknown as string,
      })
    ).rejects.toThrow()

    const buildings = await db.selectFrom('buildings').select('id').execute()

    expect(buildings).toEqual([])
  })
})
