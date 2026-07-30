import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const {
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  issueRecordingRawDownloadUrlsMock,
  listRecordingRawObjectKeysMock,
} = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  issueRecordingRawDownloadUrlsMock: vi.fn(),
  listRecordingRawObjectKeysMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  buildRecordingRawObjectKey: (organizationId: string, recordingId: string, target: string) =>
    `organizations/${organizationId}/recordings/${recordingId}/raw/${
      target === 'metadata' ? 'metadata.json' : `${target}.csv`
    }`,
  issueRecordingRawDownloadUrls: issueRecordingRawDownloadUrlsMock,
  listRecordingRawObjectKeys: listRecordingRawObjectKeysMock,
}))

import { getRecordingRaw } from './get-recording-raw.js'

const organizationId = '11111111-1111-4111-8111-111111111111'
const recordingId = '22222222-2222-4222-8222-222222222222'
const managerActor: UserRequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Group A',
      role: 'manager',
    },
  ],
}

describe('getRecordingRaw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
    })
    listRecordingRawObjectKeysMock.mockResolvedValue([])
  })

  it('アップロード済みの raw が1つあればその download URL を返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro', 'metadata'],
    })
    listRecordingRawObjectKeysMock.mockResolvedValue([
      `organizations/${organizationId}/recordings/${recordingId}/raw/acce.csv`,
    ])
    issueRecordingRawDownloadUrlsMock.mockResolvedValue({
      downloadUrls: {
        acce: 'https://storage.example.test/acce.csv',
      },
      expiresAt: '2026-07-31T00:15:00.000Z',
    })

    const result = await getRecordingRaw(managerActor, { recordingId })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        download_urls: {
          acce: 'https://storage.example.test/acce.csv',
        },
        expires_at: '2026-07-31T00:15:00.000Z',
      },
    })
    expect(issueRecordingRawDownloadUrlsMock).toHaveBeenCalledWith(organizationId, recordingId, [
      'acce',
    ])
  })

  it('raw が1つも存在しない場合は RECORDING_RAW_NOT_FOUND を返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })

    const result = await getRecordingRaw(managerActor, { recordingId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_RAW_NOT_FOUND',
        recordingId,
      },
    })
    expect(issueRecordingRawDownloadUrlsMock).not.toHaveBeenCalled()
  })

  it('存在しない recording は RECORDING_NOT_FOUND を返す', async () => {
    findRecordingByIdMock.mockResolvedValue(undefined)

    const result = await getRecordingRaw(managerActor, { recordingId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })
  })
})
