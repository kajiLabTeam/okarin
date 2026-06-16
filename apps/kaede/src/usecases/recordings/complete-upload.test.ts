import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const {
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  listRecordingRawObjectKeysMock,
  markRecordingUploadReadyMock,
} = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  listRecordingRawObjectKeysMock: vi.fn(),
  markRecordingUploadReadyMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
  markRecordingUploadReady: markRecordingUploadReadyMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  buildRecordingRawObjectKey: (organizationId: string, recordingId: string, target: string) => {
    if (target === 'metadata') {
      return `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
    }

    return `organizations/${organizationId}/recordings/${recordingId}/raw/${target}.csv`
  },
  listRecordingRawObjectKeys: listRecordingRawObjectKeysMock,
}))

import { completeUpload } from './complete-upload.js'

const serviceClientActor: RequestActor = { type: 'service_client', name: 'shared_token' }
const organizationId = '99999999-9999-4999-8999-999999999999'

const mockRecordingAuthorization = (recordingId: string) => {
  findRecordingAuthorizationByIdMock.mockResolvedValue({
    id: recordingId,
    organization_id: organizationId,
    pedestrian_id: '22222222-2222-4222-8222-222222222222',
    pedestrian_user_id: null,
  })
}

describe('completeUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording が存在しない場合は RECORDING_NOT_FOUND を返す', async () => {
    findRecordingByIdMock.mockResolvedValue(undefined)

    await expect(
      completeUpload(serviceClientActor, {
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
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro', 'metadata'],
    })
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      'organizations/99999999-9999-4999-8999-999999999999/recordings/11111111-1111-4111-8111-111111111111/raw/acce.csv',
      'organizations/99999999-9999-4999-8999-999999999999/recordings/11111111-1111-4111-8111-111111111111/raw/gyro.csv',
      'organizations/99999999-9999-4999-8999-999999999999/recordings/11111111-1111-4111-8111-111111111111/raw/metadata.json',
    ])
    markRecordingUploadReadyMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      upload_status: 'ready',
    })

    await expect(
      completeUpload(serviceClientActor, {
        recordingId,
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        recording_id: '11111111-1111-4111-8111-111111111111',
        upload_status: 'ready',
      },
    })

    expect(listRecordingRawObjectKeysMock).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      '11111111-1111-4111-8111-111111111111'
    )
    expect(markRecordingUploadReadyMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('不足 target がある場合 missing_targets を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro', 'wifi'],
    })
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      'organizations/99999999-9999-4999-8999-999999999999/recordings/11111111-1111-4111-8111-111111111111/raw/acce.csv',
    ])

    await expect(
      completeUpload(serviceClientActor, {
        recordingId,
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
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'failed',
      upload_targets: ['acce', 'gyro'],
    })
    mockRecordingAuthorization(recordingId)

    await expect(
      completeUpload(serviceClientActor, {
        recordingId,
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
    const recordingId = '11111111-1111-4111-8111-111111111111'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'broken-target'],
    })
    mockRecordingAuthorization(recordingId)

    await expect(
      completeUpload(serviceClientActor, {
        recordingId,
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

  it('member が別 user の pedestrian recording を完了しようとすると AUTH_ORGANIZATION_FORBIDDEN を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '22222222-2222-4222-8222-222222222222',
      pedestrian_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })

    await expect(
      completeUpload(
        {
          type: 'user',
          user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          email: 'member@example.test',
          global_role: 'none',
          password_must_change: false,
          memberships: [
            {
              organization_id: organizationId,
              organization_name: 'Test Organization',
              role: 'member',
            },
          ],
        },
        { recordingId }
      )
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })

    expect(listRecordingRawObjectKeysMock).not.toHaveBeenCalled()
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })
})
