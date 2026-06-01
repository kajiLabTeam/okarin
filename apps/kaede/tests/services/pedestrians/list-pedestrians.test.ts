import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { listPedestrians } from '../../../src/usecases/list-pedestrians.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('listPedestrians', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('pedestrian 一覧を返す', async () => {
    const pedestrian = await db
      .insertInto('pedestrians')
      .values({
        display_name: 'List Pedestrian',
        height: 1.72,
        stride_length: 0.7,
        attributes: {
          device: 'Pixel 8',
        },
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listPedestrians()

    expect(result.pedestrians).toHaveLength(1)
    expect(result.pedestrians[0]).toMatchObject({
      pedestrian_id: pedestrian.id,
      display_name: 'List Pedestrian',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
      },
    })
  })

  it('作成日時、ID の順で並ぶ', async () => {
    const older = await db
      .insertInto('pedestrians')
      .values({
        display_name: 'Older Pedestrian',
        created_at: new Date('2026-05-13T00:00:00.000Z'),
        updated_at: new Date('2026-05-13T00:00:00.000Z'),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const newer = await db
      .insertInto('pedestrians')
      .values({
        display_name: 'Newer Pedestrian',
        created_at: new Date('2026-05-14T00:00:00.000Z'),
        updated_at: new Date('2026-05-14T00:00:00.000Z'),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listPedestrians()

    expect(result.pedestrians.map((pedestrian) => pedestrian.pedestrian_id)).toEqual([
      older.id,
      newer.id,
    ])
  })
})
