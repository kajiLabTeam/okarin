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
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Pedestrian Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian({
      organization_id: organization.id,
      display_name: 'Pedestrian Test User',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        device: 'Pixel 8',
        dominant_hand: 'right',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
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
      .where('id', '=', result.value.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.value.pedestrian_id,
      organization_id: organization.id,
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
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Minimal Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createPedestrian({
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })

    const pedestrian = await db
      .selectFrom('pedestrians')
      .selectAll()
      .where('id', '=', result.value.pedestrian_id)
      .executeTakeFirstOrThrow()

    expect(pedestrian).toMatchObject({
      id: result.value.pedestrian_id,
      organization_id: organization.id,
      display_name: 'Minimal Pedestrian',
      height: null,
      stride_length: null,
      attributes: {},
    })
  })

  it('存在しない organization_id では pedestrian を作成しない', async () => {
    const organizationId = '99999999-9999-4999-8999-999999999999'

    const result = await createPedestrian({
      organization_id: organizationId,
      display_name: 'Missing Organization Pedestrian',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId,
      },
    })

    const pedestrians = await db.selectFrom('pedestrians').select('id').execute()

    expect(pedestrians).toEqual([])
  })

  it('空白だけの display_name は DB constraint で作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Constraint Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await expect(
      createPedestrian({
        organization_id: organization.id,
        display_name: '   ',
      })
    ).rejects.toThrow()

    const pedestrians = await db.selectFrom('pedestrians').select('id').execute()

    expect(pedestrians).toEqual([])
  })
})
