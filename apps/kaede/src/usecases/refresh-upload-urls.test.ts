import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../middleware/request-actor-context.js'

const { findRecordingAuthorizationByIdMock, findRecordingByIdMock, issueRecordingUploadUrlsMock } =
  vi.hoisted(() => ({
    findRecordingAuthorizationByIdMock: vi.fn(),
    findRecordingByIdMock: vi.fn(),
    issueRecordingUploadUrlsMock: vi.fn(),
  }))

vi.mock('../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../services/storage/index.js', () => ({
  issueRecordingUploadUrls: issueRecordingUploadUrlsMock,
}))

import { refreshUploadUrls } from './refresh-upload-urls.js'

const serviceClientActor: RequestActor = { type: 'service_client', name: 'shared_token' }

const mockRecordingAuthorization = (recordingId: string) => {
  findRecordingAuthorizationByIdMock.mockResolvedValue({
    id: recordingId,
    organization_id: '99999999-9999-4999-8999-999999999999',
    pedestrian_id: '22222222-2222-4222-8222-222222222222',
    pedestrian_user_id: null,
  })
}

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
    mockRecordingAuthorization(recordingId)
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: {
        gyro: 'https://storage.example.test/gyro',
      },
    })

    const result = await refreshUploadUrls(
      serviceClientActor,
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
      serviceClientActor,
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
    mockRecordingAuthorization(recordingId)

    const result = await refreshUploadUrls(
      serviceClientActor,
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
    mockRecordingAuthorization(recordingId)

    const result = await refreshUploadUrls(
      serviceClientActor,
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

  it('member が別 user の pedestrian recording の URL を再発行しようとすると AUTH_ORGANIZATION_FORBIDDEN を返す', async () => {
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

    const result = await refreshUploadUrls(
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
      { recordingId },
      {
        targets: ['acce'],
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })
})
