import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { createPedestrian } from '../../../src/usecases/create-pedestrian.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('createPedestrian', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('pedestrian を作成できる', async () => {
    const result = await createPedestrian({
      display_name: 'Pedestrian Test User',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
        dominant_hand: 'right',
      },
    })

    expect(result).toMatchObject({
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
      .where('id', '=', result.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.pedestrian_id,
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
    const result = await createPedestrian({
      display_name: 'Minimal Pedestrian',
    })

    expect(result).toMatchObject({
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })

    const pedestrian = await db
      .selectFrom('pedestrians')
      .selectAll()
      .where('id', '=', result.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.pedestrian_id,
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })
  })

  it('空白だけの display_name は DB constraint で作成できない', async () => {
    await expect(
      createPedestrian({
        display_name: '   ',
      })
    ).rejects.toThrow()

    const pedestrians = await db.selectFrom('pedestrians').select('id').execute()

    expect(pedestrians).toEqual([])
  })
})
