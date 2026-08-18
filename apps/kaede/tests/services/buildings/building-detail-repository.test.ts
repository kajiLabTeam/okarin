import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { findBuildingDetailForOrganization } from '../../../src/services/buildings/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('findBuildingDetailForOrganization', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('floor ごとの有効な recording 件数を集計し、building 合計を作れる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Group A' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Group B' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Building A' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const floor1 = await db
      .insertInto('floors')
      .values({
        organization_id: organization.id,
        building_id: building.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/33333333-3333-4333-8333-333333333333.png`,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const floor2 = await db
      .insertInto('floors')
      .values({
        organization_id: organization.id,
        building_id: building.id,
        level: 2,
        name: '2F',
        image_object_path: `maps/${building.id}/44444444-4444-4444-8444-444444444444.png`,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const pedestrian = await db
      .insertInto('pedestrians')
      .values({ organization_id: organization.id, display_name: 'Pedestrian', user_id: null })
      .returningAll()
      .executeTakeFirstOrThrow()

    await db
      .insertInto('recordings')
      .values([
        {
          organization_id: organization.id,
          floor_id: floor1.id,
          pedestrian_id: pedestrian.id,
          upload_targets: ['accel'],
        },
        {
          organization_id: organization.id,
          floor_id: floor1.id,
          pedestrian_id: pedestrian.id,
          upload_targets: ['gyro'],
        },
        {
          organization_id: organization.id,
          floor_id: floor1.id,
          pedestrian_id: pedestrian.id,
          upload_targets: ['mag'],
          deleted_at: new Date('2026-06-11T00:00:00.000Z'),
        },
      ])
      .execute()

    const otherBuilding = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Building B' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const otherFloor = await db
      .insertInto('floors')
      .values({
        organization_id: otherOrganization.id,
        building_id: otherBuilding.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${otherBuilding.id}/55555555-5555-4555-8555-555555555555.png`,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const otherPedestrian = await db
      .insertInto('pedestrians')
      .values({ organization_id: otherOrganization.id, display_name: 'Other', user_id: null })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('recordings')
      .values({
        organization_id: otherOrganization.id,
        floor_id: otherFloor.id,
        pedestrian_id: otherPedestrian.id,
        upload_targets: ['accel'],
      })
      .execute()

    const result = await findBuildingDetailForOrganization(organization.id, building.id, db)

    expect(result).toMatchObject({
      building: { id: building.id, organization_id: organization.id },
      floors: [
        { floor_id: floor1.id, name: '1F', recording_count: 2 },
        { floor_id: floor2.id, name: '2F', recording_count: 0 },
      ],
    })
  })

  it('別 organization の building は取得できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Group A' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Group B' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Building B' })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      findBuildingDetailForOrganization(organization.id, building.id, db)
    ).resolves.toBeUndefined()
  })
})
