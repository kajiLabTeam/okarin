import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { listFloors } from '../../../src/usecases/list-floors.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('listFloors', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('building 情報を含む floor 一覧を返す', async () => {
    const building = await db
      .insertInto('buildings')
      .values({ name: 'List Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
        scale: 25,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listFloors()

    expect(result.floors).toHaveLength(1)
    expect(result.floors[0]).toMatchObject({
      floor_id: floor.id,
      building_id: building.id,
      building_name: 'List Floor Building',
      level: 1,
      name: '1F',
      scale: 25,
    })
  })

  it('building 名、level、floor 名の順で並ぶ', async () => {
    const buildingB = await db
      .insertInto('buildings')
      .values({ name: 'B Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const buildingA = await db
      .insertInto('buildings')
      .values({ name: 'A Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('floors')
      .values([
        {
          building_id: buildingB.id,
          level: 2,
          name: '2F',
          image_object_path: `maps/${buildingB.id}/22222222-2222-4222-8222-222222222222.png`,
        },
        {
          building_id: buildingA.id,
          level: 3,
          name: '3F',
          image_object_path: `maps/${buildingA.id}/33333333-3333-4333-8333-333333333333.png`,
        },
        {
          building_id: buildingA.id,
          level: 1,
          name: '1F',
          image_object_path: `maps/${buildingA.id}/44444444-4444-4444-8444-444444444444.png`,
        },
      ])
      .execute()

    const result = await listFloors()

    expect(result.floors.map((floor) => `${floor.building_name}:${floor.name}`)).toEqual([
      'A Building:1F',
      'A Building:3F',
      'B Building:2F',
    ])
  })
})
