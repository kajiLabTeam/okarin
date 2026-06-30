import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  insertTrajectory,
  listTrajectoriesByRecordingId,
  markTrajectoryFailed,
  markTrajectoryProcessing,
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
})
