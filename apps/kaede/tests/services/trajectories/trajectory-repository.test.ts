import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  findTrajectoryById,
  insertTrajectory,
  listTrajectoriesByRecordingId,
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

    const trajectories = await listTrajectoriesByRecordingId(recording.id, db)

    expect(trajectories.map((trajectory) => trajectory.id)).toEqual([newer.id, older.id])
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
    const listed = await listTrajectoriesByRecordingId(recording.id, db)

    expect(deleted?.deleted_at?.toISOString()).toBe('2026-06-14T00:00:00.000Z')
    expect(found).toBeUndefined()
    expect(listed).toEqual([])
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
})
