import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectFromMock, insertRecordingMock, issueRecordingUploadUrlsMock } = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  insertRecordingMock: vi.fn(),
  issueRecordingUploadUrlsMock: vi.fn(),
}))

vi.mock('../services/db/index.js', () => ({
  db: {
    selectFrom: selectFromMock,
  },
}))

vi.mock('../services/recordings/index.js', () => ({
  insertRecording: insertRecordingMock,
}))

vi.mock('../services/storage/index.js', () => ({
  issueRecordingUploadUrls: issueRecordingUploadUrlsMock,
}))

import { initRecording } from './init-recording.js'

const mockEntityLookup = (table: string, result: { id: string } | undefined) => {
  const query = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(result),
  }

  selectFromMock.mockImplementation((requestedTable: string) => {
    if (requestedTable !== table) {
      return {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }
    }

    return query
  })

  return query
}

const mockEntityLookups = ({
  pedestrian,
  floor,
}: {
  pedestrian?: { id: string }
  floor?: { id: string }
}) => {
  selectFromMock.mockImplementation((table: string) => {
    const result = table === 'pedestrians' ? pedestrian : floor

    return {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(result),
    }
  })
}

describe('initRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pedestrian と floor が存在すれば recording を作成して upload URL を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'

    mockEntityLookups({
      pedestrian: { id: pedestrianId },
      floor: { id: floorId },
    })
    insertRecordingMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
    })
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: {
        acce: 'https://storage.example.test/acce',
        gyro: 'https://storage.example.test/gyro',
        metadata: 'https://storage.example.test/metadata',
      },
    })

    const result = await initRecording({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        upload_status: 'accepted',
        upload_urls: {
          acce: 'https://storage.example.test/acce',
          gyro: 'https://storage.example.test/gyro',
          metadata: 'https://storage.example.test/metadata',
        },
        expires_at: '2026-05-13T00:15:00.000Z',
      },
    })
    expect(insertRecordingMock).toHaveBeenCalledWith({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro', 'metadata'],
    })
    expect(issueRecordingUploadUrlsMock).toHaveBeenCalledWith(recordingId, [
      'acce',
      'gyro',
      'metadata',
    ])
  })

  it('pedestrian が存在しなければ PEDESTRIAN_NOT_FOUND を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    mockEntityLookups({
      pedestrian: undefined,
      floor: { id: floorId },
    })

    const result = await initRecording({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
        pedestrianId,
      },
    })
    expect(insertRecordingMock).not.toHaveBeenCalled()
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })

  it('floor が存在しなければ FLOOR_NOT_FOUND を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    mockEntityLookups({
      pedestrian: { id: pedestrianId },
      floor: undefined,
    })

    const result = await initRecording({
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId,
      },
    })
    expect(insertRecordingMock).not.toHaveBeenCalled()
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })

  it('pedestrian lookup は pedestrians table を参照する', async () => {
    const query = mockEntityLookup('pedestrians', {
      id: '11111111-1111-4111-8111-111111111111',
    })

    await initRecording({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'gyro'],
    })

    expect(query.where).toHaveBeenCalledWith('id', '=', '11111111-1111-4111-8111-111111111111')
  })
})
