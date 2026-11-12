import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const {
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  listRecordingDataAssetsMock,
  doesObjectExistMock,
  issueRecordingFileDownloadUrlMock,
  issueRecordingRawDownloadUrlsMock,
  listRecordingRawObjectKeysMock,
} = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  listRecordingDataAssetsMock: vi.fn(),
  doesObjectExistMock: vi.fn(),
  issueRecordingFileDownloadUrlMock: vi.fn(),
  issueRecordingRawDownloadUrlsMock: vi.fn(),
  listRecordingRawObjectKeysMock: vi.fn(),
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../../services/data-assets/index.js', () => ({
  listRecordingDataAssets: listRecordingDataAssetsMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  doesObjectExist: doesObjectExistMock,
  issueRecordingFileDownloadUrl: issueRecordingFileDownloadUrlMock,
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
    vi.resetAllMocks()
    listRecordingDataAssetsMock.mockResolvedValue([])
    doesObjectExistMock.mockResolvedValue(false)
    issueRecordingRawDownloadUrlsMock.mockResolvedValue({
      downloadUrls: {},
      expiresAt: '2026-07-31T00:15:00.000Z',
    })
    issueRecordingFileDownloadUrlMock.mockImplementation((key: string) =>
      Promise.resolve({
        downloadUrl: `https://storage.example.test/${key}`,
        expiresAt: '2026-07-31T00:15:00.000Z',
      })
    )
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
        files: [
          {
            data_type: 'acce',
            file_name: `recording-${recordingId}-acce.csv`,
            download_url: 'https://storage.example.test/acce.csv',
          },
        ],
        expires_at: '2026-07-31T00:15:00.000Z',
      },
    })
    expect(issueRecordingRawDownloadUrlsMock).toHaveBeenCalledWith(
      organizationId,
      recordingId,
      ['acce'],
      expect.any(Date)
    )
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

  const asset = (dataType: string, key: string, status = 'valid', format = 'csv') => ({
    data_asset_object_id: `${dataType}-object`,
    data_type: dataType,
    object_key: key,
    validation_status: status,
    format,
  })

  it('metadataだけがrawにある新方式でも全センサーのassetを返す', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    const metadataKey = `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
    listRecordingRawObjectKeysMock.mockResolvedValue([metadataKey])
    issueRecordingRawDownloadUrlsMock.mockResolvedValue({
      downloadUrls: { metadata: 'https://storage.example.test/metadata.json' },
      expiresAt: '2026-07-31T00:15:00.000Z',
    })
    listRecordingDataAssetsMock.mockResolvedValue([
      asset('acce', 'assets/acce.csv'),
      asset('gyro', 'assets/gyro.csv'),
      asset('ble', 'assets/ble.csv', 'invalid'),
      asset('pressure', 'assets/pressure.csv'),
      asset('wifi', 'assets/wifi.csv'),
    ])
    doesObjectExistMock.mockResolvedValue(true)
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.files?.map((f) => f.data_type)).toEqual([
      'metadata',
      'acce',
      'gyro',
      'ble',
      'pressure',
      'wifi',
    ])
    expect(issueRecordingFileDownloadUrlMock).toHaveBeenCalledTimes(5)
    expect(result.value.files?.find((f) => f.data_type === 'ble')?.download_url).toBe(
      'https://storage.example.test/assets/ble.csv'
    )
  })

  it('rawがなくても存在するassetだけでダウンロードでき、元の拡張子を保持する', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    listRecordingDataAssetsMock.mockResolvedValue([
      asset('custom', 'assets/custom.json', 'valid', 'json'),
    ])
    doesObjectExistMock.mockResolvedValue(true)
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result).toMatchObject({
      ok: true,
      value: {
        files: [
          {
            data_type: 'custom',
            file_name: `recording-${recordingId}-custom-custom-object.json`,
          },
        ],
      },
    })
  })

  it('移行済みassetとrawの同じキーを一度だけ返す', async () => {
    const key = `organizations/${organizationId}/recordings/${recordingId}/raw/acce.csv`
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['acce'] })
    listRecordingRawObjectKeysMock.mockResolvedValue([key])
    listRecordingDataAssetsMock.mockResolvedValue([asset('acce', key)])
    issueRecordingRawDownloadUrlsMock.mockResolvedValue({
      downloadUrls: { acce: 'https://storage.example.test/acce.csv' },
      expiresAt: '2026-07-31T00:15:00.000Z',
    })
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result.ok && result.value.files).toHaveLength(1)
    expect(doesObjectExistMock).not.toHaveBeenCalled()
    expect(issueRecordingFileDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('同じ型の別ファイルは保持し、同じキーのassetは重複を除く', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    listRecordingDataAssetsMock.mockResolvedValue([
      asset('acce', 'assets/first.csv'),
      { ...asset('acce', 'assets/second.csv'), data_asset_object_id: 'second-object' },
      asset('acce', 'assets/first.csv'),
    ])
    doesObjectExistMock.mockResolvedValue(true)
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result.ok && result.value.files).toHaveLength(2)
    if (!result.ok) return
    expect(new Set(result.value.files?.map((f) => f.file_name)).size).toBe(2)
  })

  it('未アップロードのassetを除外し、何もなければ対象なしを返す', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    listRecordingDataAssetsMock.mockResolvedValue([asset('acce', 'assets/missing.csv', 'pending')])
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result).toMatchObject({ ok: false, error: { type: 'RECORDING_RAW_NOT_FOUND' } })
    expect(issueRecordingFileDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('ストレージの権限エラーをファイル欠損として隠さない', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    listRecordingDataAssetsMock.mockResolvedValue([asset('acce', 'assets/acce.csv')])
    doesObjectExistMock.mockRejectedValue(new Error('AccessDenied'))
    await expect(getRecordingRaw(managerActor, { recordingId })).rejects.toThrow('AccessDenied')
  })

  it('権限のない利用者にはassetの一覧やURLを返さない', async () => {
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: ['metadata'] })
    const result = await getRecordingRaw({ ...managerActor, memberships: [] }, { recordingId })
    expect(result.ok).toBe(false)
    expect(listRecordingDataAssetsMock).not.toHaveBeenCalled()
    expect(listRecordingRawObjectKeysMock).not.toHaveBeenCalled()
  })

  it('旧方式の存在する全センサーを返し、欠損BLEがあっても他を取得できる', async () => {
    const targets = ['acce', 'gyro', 'metadata', 'pressure', 'wifi', 'ble']
    findRecordingByIdMock.mockResolvedValue({ id: recordingId, upload_targets: targets })
    const available = targets.filter((target) => target !== 'ble')
    listRecordingRawObjectKeysMock.mockResolvedValue(
      available.map(
        (target) =>
          `organizations/${organizationId}/recordings/${recordingId}/raw/${target === 'metadata' ? 'metadata.json' : `${target}.csv`}`
      )
    )
    issueRecordingRawDownloadUrlsMock.mockResolvedValue({
      downloadUrls: Object.fromEntries(
        available.map((target) => [target, `https://storage.example.test/${target}`])
      ),
      expiresAt: '2026-07-31T00:15:00.000Z',
    })
    const result = await getRecordingRaw(managerActor, { recordingId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.files?.map((file) => file.data_type)).toEqual(available)
    expect(result.value.download_urls.ble).toBeUndefined()
  })
})
