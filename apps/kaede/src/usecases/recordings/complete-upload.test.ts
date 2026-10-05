import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const {
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  listRecordingRawObjectKeysMock,
  markRecordingUploadReadyMock,
  validateMetadataObjectMock,
  validateBleCsvObjectMock,
  findRecordingByIdForUpdateMock,
  updateRecordingMock,
  transactionExecuteMock,
} = vi.hoisted(() => ({
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  listRecordingRawObjectKeysMock: vi.fn(),
  markRecordingUploadReadyMock: vi.fn(),
  validateMetadataObjectMock: vi.fn(),
  validateBleCsvObjectMock: vi.fn(),
  findRecordingByIdForUpdateMock: vi.fn(),
  updateRecordingMock: vi.fn(),
  transactionExecuteMock: vi.fn(),
}))

const {
  listRecordingDataAssetsMock,
  loadDataTypeDefinitionMock,
  markDataAssetInvalidMock,
  updateDataAssetObjectMock,
  updateDataAssetValidatedMock,
  validateDataAssetObjectMock,
} = vi.hoisted(() => ({
  listRecordingDataAssetsMock: vi.fn(),
  loadDataTypeDefinitionMock: vi.fn(),
  markDataAssetInvalidMock: vi.fn(),
  updateDataAssetObjectMock: vi.fn(),
  updateDataAssetValidatedMock: vi.fn(),
  validateDataAssetObjectMock: vi.fn(),
}))

vi.mock('../../services/db/index.js', () => ({
  db: { transaction: () => ({ execute: transactionExecuteMock }) },
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
  findRecordingByIdForUpdate: findRecordingByIdForUpdateMock,
  markRecordingUploadReady: markRecordingUploadReadyMock,
  updateRecording: updateRecordingMock,
}))

vi.mock('../../services/data-assets/index.js', () => ({
  listRecordingDataAssets: listRecordingDataAssetsMock,
  loadDataTypeDefinition: loadDataTypeDefinitionMock,
  markDataAssetInvalid: markDataAssetInvalidMock,
  updateDataAssetObject: updateDataAssetObjectMock,
  updateDataAssetValidated: updateDataAssetValidatedMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  buildRecordingRawObjectKey: (organizationId: string, recordingId: string, target: string) => {
    if (target === 'metadata') {
      return `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
    }

    return `organizations/${organizationId}/recordings/${recordingId}/raw/${target}.csv`
  },
  listRecordingRawObjectKeys: listRecordingRawObjectKeysMock,
  validateMetadataObject: validateMetadataObjectMock,
  validateBleCsvObject: validateBleCsvObjectMock,
  validateDataAssetObject: validateDataAssetObjectMock,
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

const createAsset = (dataType: string) => ({
  data_asset_id: `${dataType}-asset`,
  data_type: dataType,
  schema_version: '1',
  validation_status: 'pending',
  validation_error: null,
  sample_count: null,
  started_at: null,
  ended_at: null,
  client_asset_key: dataType,
  data_asset_object_id: `${dataType}-object`,
  object_key: `recordings/recording/${dataType}.csv`,
  content_type: 'text/csv',
  format: 'csv',
})

describe('completeUpload', () => {
  beforeEach(() => listRecordingDataAssetsMock.mockResolvedValue([]))
  beforeEach(() => {
    vi.clearAllMocks()
    validateMetadataObjectMock.mockResolvedValue(true)
    validateBleCsvObjectMock.mockResolvedValue(true)
    transactionExecuteMock.mockImplementation((callback: (trx: object) => unknown) => callback({}))
  })

  it('dataAssets経路で全assetを検証し、同一transactionでreadyとupload_failure nullにする', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const assets = [createAsset('acce'), createAsset('gyro')]
    const accepted = { id: recordingId, upload_status: 'accepted', upload_targets: ['metadata'] }
    const ready = { ...accepted, upload_status: 'ready' }
    findRecordingByIdMock.mockResolvedValueOnce(accepted).mockResolvedValueOnce(ready)
    findRecordingByIdForUpdateMock.mockResolvedValue(accepted)
    listRecordingDataAssetsMock.mockResolvedValue(assets)
    loadDataTypeDefinitionMock.mockResolvedValue({ format: 'csv' })
    validateDataAssetObjectMock.mockResolvedValue({
      valid: true,
      byteSize: 12,
      checksumSha256: 'checksum',
      sampleCount: 2,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      endedAt: new Date('2026-01-01T00:00:01.000Z'),
    })
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`,
    ])

    await expect(completeUpload(serviceClientActor, { recordingId })).resolves.toEqual({
      ok: true,
      value: { recording_id: recordingId, upload_status: 'ready' },
    })

    expect(transactionExecuteMock).toHaveBeenCalledTimes(1)
    expect(validateMetadataObjectMock).toHaveBeenCalledWith(organizationId, recordingId)
    expect(updateDataAssetObjectMock).toHaveBeenCalledTimes(2)
    expect(updateDataAssetValidatedMock).toHaveBeenCalledTimes(2)
    expect(updateRecordingMock).toHaveBeenCalledWith(
      recordingId,
      { upload_status: 'ready', upload_failure: null },
      expect.anything()
    )
    expect(markRecordingUploadReadyMock).not.toHaveBeenCalled()
  })

  it('dataAssetsの一部失敗でも全assetを検証し、acceptedのままupload_failureを保存する', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const assets = [createAsset('acce'), createAsset('gyro')]
    const accepted = { id: recordingId, upload_status: 'accepted', upload_targets: ['metadata'] }
    findRecordingByIdMock.mockResolvedValue(accepted)
    findRecordingByIdForUpdateMock.mockResolvedValue(accepted)
    listRecordingDataAssetsMock.mockResolvedValue(assets)
    loadDataTypeDefinitionMock.mockResolvedValue({ format: 'csv' })
    validateDataAssetObjectMock
      .mockResolvedValueOnce({ valid: true, byteSize: 12, checksumSha256: 'ok' })
      .mockResolvedValueOnce({ valid: false, byteSize: 12, checksumSha256: 'bad' })
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`,
    ])

    await expect(completeUpload(serviceClientActor, { recordingId })).resolves.toEqual({
      ok: false,
      error: { type: 'UPLOAD_FILE_INVALID', recordingId },
    })

    expect(validateDataAssetObjectMock).toHaveBeenCalledTimes(2)
    expect(updateDataAssetObjectMock).toHaveBeenCalledTimes(1)
    expect(updateDataAssetValidatedMock).toHaveBeenCalledTimes(1)
    expect(markDataAssetInvalidMock).toHaveBeenCalledWith(
      'gyro-asset',
      { code: 'ASSET_STRUCTURE_INVALID' },
      expect.anything()
    )
    expect(updateRecordingMock).toHaveBeenCalledWith(
      recordingId,
      { upload_failure: JSON.stringify({ code: 'ASSET_STRUCTURE_INVALID' }) },
      expect.anything()
    )
  })

  it('transaction取得時にaccepted以外へ変化していれば更新せずfinalizedを返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const assets = [createAsset('acce')]
    const accepted = { id: recordingId, upload_status: 'accepted', upload_targets: ['metadata'] }
    const ready = { ...accepted, upload_status: 'ready' }
    findRecordingByIdMock.mockResolvedValue(accepted)
    findRecordingByIdForUpdateMock.mockResolvedValue(ready)
    listRecordingDataAssetsMock.mockResolvedValue(assets)
    loadDataTypeDefinitionMock.mockResolvedValue({ format: 'csv' })
    validateDataAssetObjectMock.mockResolvedValue({
      valid: true,
      byteSize: 12,
      checksumSha256: 'ok',
    })
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`,
    ])

    await expect(completeUpload(serviceClientActor, { recordingId })).resolves.toEqual({
      ok: false,
      error: { type: 'RECORDING_UPLOAD_FINALIZED', recordingId, uploadStatus: 'ready' },
    })

    expect(updateDataAssetObjectMock).not.toHaveBeenCalled()
    expect(updateDataAssetValidatedMock).not.toHaveBeenCalled()
    expect(markDataAssetInvalidMock).not.toHaveBeenCalled()
    expect(updateRecordingMock).not.toHaveBeenCalled()
  })

  it('definition未対応のassetをinvalidとして確定する', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const asset = createAsset('unknown')
    const accepted = { id: recordingId, upload_status: 'accepted', upload_targets: ['metadata'] }
    findRecordingByIdMock.mockResolvedValue(accepted)
    findRecordingByIdForUpdateMock.mockResolvedValue(accepted)
    listRecordingDataAssetsMock.mockResolvedValue([asset])
    loadDataTypeDefinitionMock.mockResolvedValue(undefined)
    mockRecordingAuthorization(recordingId)
    listRecordingRawObjectKeysMock.mockResolvedValue([
      `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`,
    ])

    await expect(completeUpload(serviceClientActor, { recordingId })).resolves.toEqual({
      ok: false,
      error: { type: 'UPLOAD_FILE_INVALID', recordingId },
    })

    expect(validateDataAssetObjectMock).not.toHaveBeenCalled()
    expect(markDataAssetInvalidMock).toHaveBeenCalledWith(
      'unknown-asset',
      { code: 'DATA_TYPE_NOT_SUPPORTED' },
      expect.anything()
    )
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
          account_state: 'active',
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
