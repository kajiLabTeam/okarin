import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findRecordingByIdMock, issueRecordingUploadUrlsMock } = vi.hoisted(() => ({
  findRecordingByIdMock: vi.fn(),
  issueRecordingUploadUrlsMock: vi.fn(),
}))

vi.mock('../services/recordings/index.js', () => ({
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../services/storage/index.js', () => ({
  issueRecordingUploadUrls: issueRecordingUploadUrlsMock,
}))

import { refreshUploadUrls } from './refresh-upload-urls.js'

describe('refreshUploadUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepted recording の指定 target に対して upload URL を再発行する', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro', 'wifi'],
    })
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: {
        gyro: 'https://storage.example.test/gyro',
      },
    })

    const result = await refreshUploadUrls(
      { recordingId },
      {
        targets: ['gyro'],
      }
    )

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        upload_status: 'accepted',
        upload_urls: {
          gyro: 'https://storage.example.test/gyro',
        },
        expires_at: '2026-05-13T00:15:00.000Z',
      },
    })
    expect(issueRecordingUploadUrlsMock).toHaveBeenCalledWith(recordingId, ['gyro'])
  })

  it('存在しない recording は RECORDING_NOT_FOUND を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue(undefined)

    const result = await refreshUploadUrls(
      { recordingId },
      {
        targets: ['acce'],
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })

  it('accepted 以外の recording は再発行しない', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })

    const result = await refreshUploadUrls(
      { recordingId },
      {
        targets: ['acce'],
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_URL_REFRESH_FORBIDDEN',
        recordingId,
        uploadStatus: 'ready',
      },
    })
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })

  it('recording の upload_targets に含まれない target は再発行しない', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })

    const result = await refreshUploadUrls(
      { recordingId },
      {
        targets: ['wifi'],
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId,
        invalidTargets: ['wifi'],
      },
    })
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })
})
