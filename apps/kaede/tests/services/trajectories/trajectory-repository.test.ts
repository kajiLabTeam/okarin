import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findTrajectoryById,
  insertTrajectory,
  listTrajectoriesByOrganizationIdPaginated,
  listTrajectoriesByRecordingIdPaginated,
  markTrajectoryFailed,
  markTrajectoryProcessing,
  softDeleteTrajectory,
} from '../../../src/services/trajectories/index.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()

describe('trajectory repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('accepted を processing に更新できる', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db, {
      uploadTargets: ['acce', 'gyro'],
      floorLevel: 1,
      floorName: '1F',
      buildingName: 'Trajectory Building',
    })

    const created = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'accepted',
      },
      db
    )

    const updated = await markTrajectoryProcessing(created.id, db)

    expect(updated?.status).toBe('processing')
  })

  it('completed は failed に更新しない', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db, {
      uploadTargets: ['acce', 'gyro'],
      floorLevel: 1,
      floorName: '1F',
      buildingName: 'Trajectory Building',
    })

    const created = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
      },
      db
    )

    const updated = await markTrajectoryFailed(
      created.id,
      'NOZOMI_REQUEST_FAILED',
      'failed to submit analyze request to nozomi',
      new Date('2026-05-18T00:00:00.000Z'),
      db
    )

    expect(updated).toBeUndefined()
  })

  it('recording_id に紐づく未削除 trajectory を作成日時降順で取得できる', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db, {
      uploadTargets: ['acce', 'gyro'],
      floorLevel: 1,
      floorName: '1F',
      buildingName: 'Trajectory Building',
    })

    const older = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
        created_at: new Date('2026-06-11T00:00:00.000Z'),
      },
      db
    )
    const newer = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'processing',
        created_at: new Date('2026-06-12T00:00:00.000Z'),
      },
      db
    )
    await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
        deleted_at: new Date('2026-06-13T00:00:00.000Z'),
      },
      db
    )

    const trajectories = await listTrajectoriesByRecordingIdPaginated(
      recording.id,
      { limit: 100, cursor: null },
      db
    )

    expect(trajectories.rows.map((trajectory) => trajectory.id)).toEqual([newer.id, older.id])
  })

  it('trajectory を論理削除し active query から除外できる', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db, {
      uploadTargets: ['acce', 'gyro'],
      floorLevel: 1,
      floorName: '1F',
      buildingName: 'Trajectory Building',
    })
    const deletedAt = new Date('2026-06-14T00:00:00.000Z')
    const created = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
      },
      db
    )

    const deleted = await softDeleteTrajectory(created.id, deletedAt, db)
    const found = await findTrajectoryById(created.id, db)
    const listed = await listTrajectoriesByRecordingIdPaginated(
      recording.id,
      { limit: 100, cursor: null },
      db
    )

    expect(deleted?.deleted_at?.toISOString()).toBe('2026-06-14T00:00:00.000Z')
    expect(found).toBeUndefined()
    expect(listed).toEqual({ rows: [], totalCount: 0 })
  })

  it('削除済み trajectory は再削除しない', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db, {
      uploadTargets: ['acce', 'gyro'],
      floorLevel: 1,
      floorName: '1F',
      buildingName: 'Trajectory Building',
    })
    const created = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
        deleted_at: new Date('2026-06-13T00:00:00.000Z'),
      },
      db
    )

    const deleted = await softDeleteTrajectory(created.id, new Date('2026-06-14T00:00:00.000Z'), db)

    expect(deleted).toBeUndefined()
  })

  it('trajectory をマイクロ秒精度の cursor でページングできる', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db)
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
      await insertTrajectory(
        {
          id,
          recording_id: recording.id,
          floor_id: floor.id,
          organization_id: organization.id,
          status: 'completed',
          created_at: timestamps[index],
        },
        db
      )
    }

    await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'completed',
        deleted_at: new Date('2026-07-28T01:00:00.000Z'),
      },
      db
    )

    const first = await listTrajectoriesByRecordingIdPaginated(
      recording.id,
      { limit: 1, cursor: null },
      db
    )
    const second = await listTrajectoriesByRecordingIdPaginated(
      recording.id,
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

  it('organization に紐づく未削除 trajectory を安定した順序でページングできる', async () => {
    const fixtureA = await createRecordingFixture(db, { organizationName: 'Organization A' })
    const fixtureB = await createRecordingFixture(db, { organizationName: 'Organization B' })
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]

    for (const [id, createdAt] of [
      [ids[0], '2026-07-28T00:00:00.123455Z'],
      [ids[1], '2026-07-28T00:00:00.123456Z'],
      [ids[2], '2026-07-28T00:00:00.123456Z'],
    ] as const) {
      await insertTrajectory(
        {
          id,
          recording_id: fixtureA.recording.id,
          floor_id: fixtureA.floor.id,
          organization_id: fixtureA.organization.id,
          status: 'completed',
          created_at: createdAt,
        },
        db
      )
    }

    await insertTrajectory(
      {
        recording_id: fixtureA.recording.id,
        floor_id: fixtureA.floor.id,
        organization_id: fixtureA.organization.id,
        status: 'completed',
        deleted_at: new Date('2026-07-28T01:00:00.000Z'),
      },
      db
    )
    await insertTrajectory(
      {
        recording_id: fixtureB.recording.id,
        floor_id: fixtureB.floor.id,
        organization_id: fixtureB.organization.id,
        status: 'completed',
        created_at: '2026-07-28T02:00:00.000000Z',
      },
      db
    )

    const first = await listTrajectoriesByOrganizationIdPaginated(
      fixtureA.organization.id,
      { limit: 2, cursor: null },
      db
    )
    const second = await listTrajectoriesByOrganizationIdPaginated(
      fixtureA.organization.id,
      {
        limit: 2,
        cursor: {
          createdAt: first.rows[1].cursor_created_at,
          id: first.rows[1].id,
        },
      },
      db
    )

    expect(first.totalCount).toBe(3)
    expect(first.rows).toHaveLength(3)
    expect(first.rows.slice(0, 2).map((trajectory) => trajectory.id)).toEqual([ids[2], ids[1]])
    expect(first.rows[0].cursor_created_at).toBe('2026-07-28T00:00:00.123456Z')
    expect(second.totalCount).toBe(3)
    expect(second.rows.map((trajectory) => trajectory.id)).toEqual([ids[0]])
  })
})
