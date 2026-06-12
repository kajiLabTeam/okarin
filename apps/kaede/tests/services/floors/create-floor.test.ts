import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { createFloor } from '../../../src/usecases/create-floor.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

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

    const result = await createFloor({
      building_id: building.id,
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

    const result = await createFloor({
      building_id: buildingId,
      level: 1,
      name: '1F',
    })

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
})
