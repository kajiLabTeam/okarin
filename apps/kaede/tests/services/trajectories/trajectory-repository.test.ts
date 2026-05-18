import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  insertTrajectory,
  markTrajectoryFailed,
  markTrajectoryProcessing,
} from '../../../src/services/trajectories/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const createFloorFixture = async () => {
  const building = await db
    .insertInto('buildings')
    .values({ name: 'Trajectory Building' })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      level: 1,
      name: '1F',
      image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return floor
}

describe('trajectory repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('accepted を processing に更新できる', async () => {
    const floor = await createFloorFixture()

    const created = await insertTrajectory(
      {
        recording_id: '11111111-1111-4111-8111-111111111111',
        floor_id: floor.id,
        status: 'accepted',
      },
      db
    )

    const updated = await markTrajectoryProcessing(created.id, db)

    expect(updated?.status).toBe('processing')
  })

  it('completed は failed に更新しない', async () => {
    const floor = await createFloorFixture()

    const created = await insertTrajectory(
      {
        recording_id: '11111111-1111-4111-8111-111111111111',
        floor_id: floor.id,
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
})
