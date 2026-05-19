import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import type * as StorageService from '../../../src/services/storage/index.js'
import { generateCallbackToken } from '../../../src/services/trajectories/index.js'
import { resetDatabase } from '../../db/helpers.js'
import { createTrajectoryFixture } from '../../fixtures/trajectories.js'

const { doesTrajectoryAnalyzedResultObjectExistMock } = vi.hoisted(() => ({
  doesTrajectoryAnalyzedResultObjectExistMock: vi.fn(),
}))

vi.mock('../../../src/services/storage/index.js', async () => {
  const actual = await vi.importActual<typeof StorageService>(
    '../../../src/services/storage/index.js'
  )

  return {
    ...actual,
    doesTrajectoryAnalyzedResultObjectExist: doesTrajectoryAnalyzedResultObjectExistMock,
  }
})

const db = createDb()
const app = createApp()

describe('POST /api/trajectories/callback', () => {
  beforeEach(async () => {
    await resetDatabase(db)
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('completed callback を受理して completed に更新する', async () => {
    const { trajectory } = await createTrajectoryFixture(db, {
      trajectoryStatus: 'processing',
    })
    doesTrajectoryAnalyzedResultObjectExistMock.mockResolvedValue(true)
    const callbackToken = generateCallbackToken(trajectory.id)

    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: trajectory.id,
        status: 'completed',
        callback_token: callbackToken,
        result_object_key: `trajectories/${trajectory.id}/analyzed/result.csv`,
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectory.id,
      status: 'completed',
    })

    const updated = await db
      .selectFrom('trajectories')
      .selectAll()
      .where('id', '=', trajectory.id)
      .executeTakeFirstOrThrow()

    expect(updated.status).toBe('completed')
    expect(updated.error_code).toBeNull()
    expect(updated.error_message).toBeNull()
  })

  it('failed callback を受理して failed に更新する', async () => {
    const { trajectory } = await createTrajectoryFixture(db, {
      trajectoryStatus: 'processing',
    })
    const callbackToken = generateCallbackToken(trajectory.id)

    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: trajectory.id,
        status: 'failed',
        callback_token: callbackToken,
        error_code: 'ANALYSIS_FAILED',
        error_message: 'trajectory estimation failed',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectory_id: trajectory.id,
      status: 'failed',
    })

    const updated = await db
      .selectFrom('trajectories')
      .selectAll()
      .where('id', '=', trajectory.id)
      .executeTakeFirstOrThrow()

    expect(updated.status).toBe('failed')
    expect(updated.error_code).toBe('ANALYSIS_FAILED')
    expect(updated.error_message).toBe('trajectory estimation failed')
    expect(updated.failed_at).not.toBeNull()
  })
})
