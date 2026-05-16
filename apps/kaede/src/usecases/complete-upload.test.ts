import { beforeEach, describe, expect, it, vi } from 'vitest'

const { doesRecordingRawObjectExistMock, findRecordingByIdMock, markRecordingUploadReadyMock } =
  vi.hoisted(() => ({
    doesRecordingRawObjectExistMock: vi.fn(),
    findRecordingByIdMock: vi.fn(),
    markRecordingUploadReadyMock: vi.fn(),
  }))

vi.mock('../services/recordings/index.js', () => ({
  findRecordingById: findRecordingByIdMock,
  markRecordingUploadReady: markRecordingUploadReadyMock,
}))

vi.mock('../services/storage/index.js', () => ({
  doesRecordingRawObjectExist: doesRecordingRawObjectExistMock,
}))

import { completeUpload } from './complete-upload.js'

describe('completeUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('全 target が存在する場合 ready に更新する', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })
    doesRecordingRawObjectExistMock.mockResolvedValue(true)
    markRecordingUploadReadyMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'ready',
    })

    await expect(
      completeUpload({
        recordingId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        recording_id: '11111111-1111-4111-8111-111111111111',
        upload_status: 'ready',
      },
    })

    expect(doesRecordingRawObjectExistMock).toHaveBeenCalledTimes(2)
    expect(markRecordingUploadReadyMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('不足 target がある場合 missing_targets を返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro', 'wifi'],
    })
    doesRecordingRawObjectExistMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    await expect(
      completeUpload({
        recordingId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'UPLOAD_TARGETS_MISSING',
        recordingId: '11111111-1111-4111-8111-111111111111',
        missingTargets: ['gyro', 'wifi'],
      },
    })

    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })

  it('ready または failed は finalized として拒否する', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'failed',
      upload_targets: ['acce', 'gyro'],
    })

    await expect(
      completeUpload({
        recordingId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId: '11111111-1111-4111-8111-111111111111',
        uploadStatus: 'failed',
      },
    })

    expect(doesRecordingRawObjectExistMock).not.toHaveBeenCalled()
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })
})
