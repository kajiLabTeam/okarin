import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectFromMock, insertRecordingMock, issueRecordingUploadUrlsMock } = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  insertRecordingMock: vi.fn(),
  issueRecordingUploadUrlsMock: vi.fn(),
}))

vi.mock('../../services/db/index.js', () => ({
  db: {
    selectFrom: selectFromMock,
  },
}))

vi.mock('../../services/recordings/index.js', () => ({
  insertRecording: insertRecordingMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  issueRecordingUploadUrls: issueRecordingUploadUrlsMock,
}))

import { createApp } from '../../server.js'

const makeLookupQuery = (result: { id: string } | undefined) => ({
  select: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      executeTakeFirst: vi.fn().mockResolvedValue(result),
    }),
  }),
})

describe('POST /api/recordings/init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording 作成後に署名付き URL を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'

    selectFromMock.mockImplementation((table: string) => {
      if (table === 'pedestrians') {
        return makeLookupQuery({ id: pedestrianId })
      }

      if (table === 'floors') {
        return makeLookupQuery({ id: floorId })
      }

      throw new Error(`unexpected table: ${table}`)
    })

    insertRecordingMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
    })
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
      },
    })

    const app = createApp()
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://example.test/acce',
        gyro: 'https://example.test/gyro',
      },
      expires_at: '2026-05-13T00:15:00.000Z',
    })

    expect(insertRecordingMock).toHaveBeenCalledWith({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })
    expect(issueRecordingUploadUrlsMock).toHaveBeenCalledWith(recordingId, ['acce', 'gyro'])
  })

  it('存在しない floor_id は 404 を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    selectFromMock.mockImplementation((table: string) => {
      if (table === 'pedestrians') {
        return makeLookupQuery({ id: pedestrianId })
      }

      if (table === 'floors') {
        return makeLookupQuery(undefined)
      }

      throw new Error(`unexpected table: ${table}`)
    })

    const app = createApp()
    const response = await app.request('/api/recordings/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'FLOOR_NOT_FOUND',
      error_message: 'floor_id does not exist',
      details: {
        floor_id: floorId,
      },
    })
  })
})
