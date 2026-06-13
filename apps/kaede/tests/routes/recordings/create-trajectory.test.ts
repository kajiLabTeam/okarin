import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import { createTrajectoryResponseSchema } from '../../../src/schemas/trajectories.js'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import type * as StorageService from '../../../src/services/storage/index.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const {
  issueInternalRecordingRawDownloadUrlsMock,
  issueInternalTrajectoryResultUploadUrlMock,
  submitAnalyzeRequestMock,
} = vi.hoisted(() => ({
  issueInternalRecordingRawDownloadUrlsMock: vi.fn(),
  issueInternalTrajectoryResultUploadUrlMock: vi.fn(),
  submitAnalyzeRequestMock: vi.fn(),
}))

vi.mock('../../../src/services/storage/index.js', async () => {
  const actual = await vi.importActual<typeof StorageService>(
    '../../../src/services/storage/index.js'
  )

  return {
    ...actual,
    issueInternalRecordingRawDownloadUrls: issueInternalRecordingRawDownloadUrlsMock,
    issueInternalTrajectoryResultUploadUrl: issueInternalTrajectoryResultUploadUrlMock,
  }
})

vi.mock('../../../src/services/nozomi/index.js', () => ({
  submitAnalyzeRequest: submitAnalyzeRequestMock,
}))

const db = createDb()
let app: ReturnType<typeof createApp>

const authHeaders = {
  authorization: 'Bearer shared-token',
}

describe('POST /api/recordings/:recordingId/trajectories', () => {
  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    resetRuntimeConfigForTests()
    app = createApp()
    await resetDatabase(db)
    vi.clearAllMocks()
    issueInternalRecordingRawDownloadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      rawDataUrls: {
        acce: 'http://seaweedfs:8333/acce',
        gyro: 'http://seaweedfs:8333/gyro',
      },
    })
    issueInternalTrajectoryResultUploadUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      uploadUrl: 'http://seaweedfs:8333/result',
      objectKey: 'trajectories/placeholder/analyzed/result.csv',
    })
  })

  afterAll(async () => {
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()
  })

  it('trajectory と constraints を作成し processing を返す', async () => {
    const { organizationId, recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })

    submitAnalyzeRequestMock.mockImplementation((payload: { trajectory_id: string }) => ({
      trajectory_id: payload.trajectory_id,
      status: 'accepted',
    }))

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [
          {
            seq: 0,
            point_type: 'start',
            x: 12.34,
            y: 56.78,
            direction: 90,
          },
          {
            seq: 1,
            point_type: 'waypoint',
            x: 18.2,
            y: 60.1,
            relative_timestamp: 12000,
          },
        ],
      }),
    })

    expect(response.status).toBe(201)

    const body = createTrajectoryResponseSchema.parse(await response.json())
    expect(body.recording_id).toBe(recordingId)
    expect(body.organization_id).toBe(organizationId)
    expect(body.status).toBe('processing')

    const created = await db
      .selectFrom('trajectories')
      .selectAll()
      .where('id', '=', body.trajectory_id)
      .executeTakeFirstOrThrow()

    expect(created.recording_id).toBe(recordingId)
    expect(created.organization_id).toBe(organizationId)
    expect(created.status).toBe('processing')
    expect(created.error_code).toBeNull()
    expect(created.error_message).toBeNull()

    const constraints = await db
      .selectFrom('trajectory_constraints')
      .selectAll()
      .where('trajectory_id', '=', body.trajectory_id)
      .orderBy('seq', 'asc')
      .execute()

    expect(constraints).toHaveLength(2)
    expect(constraints[0]).toMatchObject({
      point_type: 'start',
      seq: 0,
      x: 12.34,
      y: 56.78,
      direction: 90,
      relative_timestamp: null,
    })
    expect(constraints[1]).toMatchObject({
      point_type: 'waypoint',
      seq: 1,
      x: 18.2,
      y: 60.1,
      relative_timestamp: 12000,
    })

    expect(submitAnalyzeRequestMock).toHaveBeenCalledTimes(1)
  })

  it('ready でない recording は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_READY',
      error_message: 'recording is not ready for trajectory creation',
      details: {
        recording_id: recordingId,
        upload_status: 'accepted',
      },
    })
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })

  it('nozomi 依頼失敗時は 502 を返し trajectory を failed にする', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })

    submitAnalyzeRequestMock.mockRejectedValue(new Error('upstream failure'))

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error_code).toBe('NOZOMI_REQUEST_FAILED')

    const created = await db
      .selectFrom('trajectories')
      .selectAll()
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow()

    expect(created.recording_id).toBe(recordingId)
    expect(created.status).toBe('failed')
    expect(created.error_code).toBe('NOZOMI_REQUEST_FAILED')
    expect(created.error_message).toBe('failed to submit analyze request to nozomi')
    expect(created.failed_at).not.toBeNull()
  })
})
