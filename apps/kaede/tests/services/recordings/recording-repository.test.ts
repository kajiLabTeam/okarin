import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findRecordingById,
  insertRecording,
  listRecordingsByOrganizationIdPaginated,
  listRecordingsByPedestrianIdPaginated,
  markRecordingUploadFailed,
  markRecordingUploadReady,
  updateRecordingConstraints,
} from '../../../src/services/recordings/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const createRecordingParents = async (suffix: string) => {
  const organization = await db
    .insertInto('organizations')
    .values({ name: `Recording Test Organization ${suffix}` })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const building = await db
    .insertInto('buildings')
    .values({ name: `Building ${suffix}`, organization_id: organization.id })
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
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .values({
      display_name: `Recording Test Pedestrian ${suffix}`,
      organization_id: organization.id,
      user_id: null,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return { organization, building, floor, pedestrian }
}

describe('recording repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('recording を登録して取得できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('A')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )

    const found = await findRecordingById(created.id, db)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
    expect(found?.upload_status).toBe('accepted')
  })

  it('upload_status を ready に更新できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('B')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro', 'wifi'],
      },
      db
    )

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated?.upload_status).toBe('ready')
  })

  it('accepted 以外の upload_status は ready に更新しない', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('C')

    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )

    await markRecordingUploadFailed(created.id, db)

    const updated = await markRecordingUploadReady(created.id, db)

    expect(updated).toBeUndefined()
  })

  it('constraints を全置換できる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('D')
    const created = await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      },
      db
    )
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]

    const updated = await updateRecordingConstraints(created.id, constraints, db)

    expect(updated?.constraints).toEqual(constraints)
  })

  it('organization recording をマイクロ秒精度の cursor でページングできる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('E')
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]
    const timestamps = [
      '2026-07-28T00:00:00.123400Z',
      '2026-07-28T00:00:00.123500Z',
      '2026-07-28T00:00:00.123600Z',
    ]

    for (const [index, id] of ids.entries()) {
      await insertRecording(
        {
          id,
          pedestrian_id: pedestrian.id,
          floor_id: floor.id,
          organization_id: organization.id,
          upload_targets: ['acce', 'gyro'],
          created_at: timestamps[index],
        },
        db
      )
    }

    await insertRecording(
      {
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
        deleted_at: new Date('2026-07-28T01:00:00.000Z'),
      },
      db
    )

    const first = await listRecordingsByOrganizationIdPaginated(
      organization.id,
      { limit: 1, cursor: null },
      db
    )
    const second = await listRecordingsByOrganizationIdPaginated(
      organization.id,
      {
        limit: 1,
        cursor: {
          createdAt: first.rows[0].cursor_created_at,
          id: first.rows[0].id,
        },
      },
      db
    )

    expect(first.totalCount).toBe(3)
    expect(first.rows).toHaveLength(2)
    expect(first.rows[0]).toMatchObject({
      id: ids[2],
      cursor_created_at: timestamps[2],
    })
    expect(second.totalCount).toBe(3)
    expect(second.rows[0]).toMatchObject({
      id: ids[1],
      cursor_created_at: timestamps[1],
    })
  })

  it('pedestrian recording を created_at、id の降順でページングできる', async () => {
    const { organization, floor, pedestrian } = await createRecordingParents('F')
    const createdAt = '2026-07-28T00:00:00.123456Z'
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]

    for (const id of ids) {
      await insertRecording(
        {
          id,
          pedestrian_id: pedestrian.id,
          floor_id: floor.id,
          organization_id: organization.id,
          upload_targets: ['acce', 'gyro'],
          created_at: createdAt,
        },
        db
      )
    }

    const first = await listRecordingsByPedestrianIdPaginated(
      pedestrian.id,
      { limit: 2, cursor: null },
      db
    )
    const second = await listRecordingsByPedestrianIdPaginated(
      pedestrian.id,
      {
        limit: 2,
        cursor: {
          createdAt: first.rows[1].cursor_created_at,
          id: first.rows[1].id,
        },
      },
      db
    )

    expect(first.rows.map((row) => row.id)).toEqual([ids[2], ids[1], ids[0]])
    expect(second.rows.map((row) => row.id)).toEqual([ids[0]])
    expect(second.totalCount).toBe(3)
  })
})
