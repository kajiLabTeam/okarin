import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findRecordingByIdMock, listRecordingRawObjectKeysMock, markRecordingUploadReadyMock } =
  vi.hoisted(() => ({
    findRecordingByIdMock: vi.fn(),
    listRecordingRawObjectKeysMock: vi.fn(),
    markRecordingUploadReadyMock: vi.fn(),
  }))

vi.mock('../services/recordings/index.js', () => ({
  findRecordingById: findRecordingByIdMock,
  markRecordingUploadReady: markRecordingUploadReadyMock,
}))

vi.mock('../services/storage/index.js', () => ({
  buildRecordingRawObjectKey: (recordingId: string, target: string) =>
    `recordings/${recordingId}/raw/${target}.csv`,
  listRecordingRawObjectKeys: listRecordingRawObjectKeysMock,
}))

import { completeUpload } from './complete-upload.js'

describe('completeUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording が存在しない場合は RECORDING_NOT_FOUND を返す', async () => {
    findRecordingByIdMock.mockResolvedValue(undefined)

    await expect(
      completeUpload({
        recordingId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: '11111111-1111-4111-8111-111111111111',
      },
    })

    expect(listRecordingRawObjectKeysMock).not.toHaveBeenCalled()
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })

  it('全 target が存在する場合 ready に更新する', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })
    listRecordingRawObjectKeysMock.mockResolvedValue([
      'recordings/11111111-1111-4111-8111-111111111111/raw/acce.csv',
      'recordings/11111111-1111-4111-8111-111111111111/raw/gyro.csv',
    ])
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

    expect(listRecordingRawObjectKeysMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    )
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
    listRecordingRawObjectKeysMock.mockResolvedValue([
      'recordings/11111111-1111-4111-8111-111111111111/raw/acce.csv',
    ])

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

    expect(listRecordingRawObjectKeysMock).not.toHaveBeenCalled()
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })

  it('recording.upload_targets に不正値がある場合は制御されたエラーを返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'accepted',
      upload_targets: ['acce', 'broken-target'],
    })

    await expect(
      completeUpload({
        recordingId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: '11111111-1111-4111-8111-111111111111',
        invalidTargets: ['broken-target'],
      },
    })

    expect(listRecordingRawObjectKeysMock).not.toHaveBeenCalled()
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })
})
