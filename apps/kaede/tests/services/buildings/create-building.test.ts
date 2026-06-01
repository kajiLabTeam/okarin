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
    const result = await createBuilding({
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })

    expect(result).toMatchObject({
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })

    const building = await db
      .selectFrom('buildings')
      .selectAll()
      .where('id', '=', result.building_id)
      .executeTakeFirstOrThrow()

    expect(building).toMatchObject({
      id: result.building_id,
      name: 'Building Test Site',
      latitude: 35.681236,
      longitude: 139.767125,
    })
  })

  it('任意項目を省略すると null で作成できる', async () => {
    const result = await createBuilding({
      name: 'Minimal Building',
    })

    expect(result).toMatchObject({
      name: 'Minimal Building',
      latitude: null,
      longitude: null,
    })

    const building = await db
      .selectFrom('buildings')
      .selectAll()
      .where('id', '=', result.building_id)
      .executeTakeFirstOrThrow()

    expect(building).toMatchObject({
      id: result.building_id,
      name: 'Minimal Building',
      latitude: null,
      longitude: null,
    })
  })

  it('name がない場合は DB constraint で作成できない', async () => {
    await expect(
      createBuilding({
        // route validation normally rejects this before usecase execution.
        name: undefined as unknown as string,
      })
    ).rejects.toThrow()

    const buildings = await db.selectFrom('buildings').select('id').execute()

    expect(buildings).toEqual([])
  })
})
