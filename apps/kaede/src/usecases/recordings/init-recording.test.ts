import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const {
  findFloorByIdMock,
  findPedestrianByIdMock,
  insertRecordingMock,
  issueRecordingUploadUrlsMock,
  issueDataAssetUploadUrlMock,
} = vi.hoisted(() => ({
  findFloorByIdMock: vi.fn(),
  findPedestrianByIdMock: vi.fn(),
  insertRecordingMock: vi.fn(),
  issueRecordingUploadUrlsMock: vi.fn(),
  issueDataAssetUploadUrlMock: vi.fn(),
}))

const {
  insertDataAssetMock,
  insertDataAssetObjectMock,
  linkRecordingDataAssetMock,
  loadDataTypeDefinitionMock,
  transactionExecuteMock,
} = vi.hoisted(() => ({
  insertDataAssetMock: vi.fn(),
  insertDataAssetObjectMock: vi.fn(),
  linkRecordingDataAssetMock: vi.fn(),
  loadDataTypeDefinitionMock: vi.fn(),
  transactionExecuteMock: vi.fn(),
}))

vi.mock('../../services/floors/index.js', () => ({
  findFloorById: findFloorByIdMock,
}))

vi.mock('../../services/pedestrians/index.js', () => ({
  findPedestrianById: findPedestrianByIdMock,
}))

vi.mock('../../services/recordings/index.js', () => ({
  insertRecording: insertRecordingMock,
}))

vi.mock('../../services/data-assets/index.js', () => ({
  insertDataAsset: insertDataAssetMock,
  insertDataAssetObject: insertDataAssetObjectMock,
  linkRecordingDataAsset: linkRecordingDataAssetMock,
  loadDataTypeDefinition: loadDataTypeDefinitionMock,
}))

vi.mock('../../services/db/index.js', () => ({
  db: { transaction: () => ({ execute: transactionExecuteMock }) },
}))

vi.mock('../../services/storage/index.js', () => ({
  buildDataAssetObjectKey: (
    organizationId: string,
    recordingId: string,
    dataAssetId: string,
    format: string
  ) => `organizations/${organizationId}/recordings/${recordingId}/assets/${dataAssetId}.${format}`,
  issueDataAssetUploadUrl: issueDataAssetUploadUrlMock,
  issueRecordingUploadUrls: issueRecordingUploadUrlsMock,
}))

import { initRecording } from './init-recording.js'

const serviceClientActor: RequestActor = { type: 'service_client', name: 'shared_token' }

const mockEntityLookups = ({
  pedestrian,
  floor,
}: {
  pedestrian?: { id: string; organization_id: string; user_id?: string | null }
  floor?: { id: string; organization_id: string }
}) => {
  findPedestrianByIdMock.mockResolvedValue(pedestrian)
  findFloorByIdMock.mockResolvedValue(floor)
}

describe('initRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionExecuteMock.mockImplementation((callback: (trx: object) => unknown) => callback({}))
  })

  it('assets方式ではcatalogに従ってtransaction内でassetを作成し、upload URLとavailable_assetsを返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'
    const dataAssetId = '44444444-4444-4444-8444-444444444444'
    const dataAssetObjectId = '55555555-5555-4555-8555-555555555555'

    mockEntityLookups({
      pedestrian: { id: pedestrianId, organization_id: organizationId },
      floor: { id: floorId, organization_id: organizationId },
    })
    const recording = {
      id: recordingId,
      organization_id: organizationId,
      upload_status: 'accepted',
    }
    insertRecordingMock.mockResolvedValue(recording)
    insertDataAssetMock.mockResolvedValue({ id: dataAssetId, organization_id: organizationId })
    insertDataAssetObjectMock.mockResolvedValue({ id: dataAssetObjectId })
    linkRecordingDataAssetMock.mockResolvedValue({
      recording_id: recordingId,
      data_asset_id: dataAssetId,
    })
    loadDataTypeDefinitionMock.mockResolvedValue({
      content_types: ['text/csv'],
      format: 'csv',
    })
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: { metadata: 'https://storage.example.test/metadata' },
    })
    issueDataAssetUploadUrlMock.mockResolvedValue('https://storage.example.test/acce.csv')

    const result = await initRecording(serviceClientActor, {
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      assets: [{ data_type: 'acce', schema_version: '1', format: 'csv', client_asset_key: 'walk' }],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        organization_id: organizationId,
        upload_status: 'accepted',
        upload_urls: { metadata: 'https://storage.example.test/metadata' },
        available_assets: [
          {
            data_asset_id: dataAssetId,
            data_type: 'acce',
            schema_version: '1',
            object_upload_url: 'https://storage.example.test/acce.csv',
          },
        ],
        expires_at: '2026-05-13T00:15:00.000Z',
      },
    })
    expect(transactionExecuteMock).toHaveBeenCalledTimes(1)
    expect(insertRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ upload_targets: ['metadata'] }),
      expect.anything()
    )
    expect(insertDataAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ data_type: 'acce', schema_version: '1' }),
      expect.anything()
    )
    expect(insertDataAssetObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ content_type: 'text/csv', data_asset_id: dataAssetId }),
      expect.anything()
    )
    expect(linkRecordingDataAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ recording_id: recordingId, data_asset_id: dataAssetId }),
      expect.anything()
    )
    expect(issueDataAssetUploadUrlMock).toHaveBeenCalledWith(
      organizationId,
      recordingId,
      dataAssetId,
      'csv',
      'text/csv'
    )
  })

  it('未対応data typeではtransactionとinsertを実行せずDATA_TYPE_NOT_SUPPORTEDを返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    mockEntityLookups({
      pedestrian: { id: pedestrianId, organization_id: '99999999-9999-4999-8999-999999999999' },
      floor: { id: floorId, organization_id: '99999999-9999-4999-8999-999999999999' },
    })
    loadDataTypeDefinitionMock.mockResolvedValue(undefined)

    await expect(
      initRecording(serviceClientActor, {
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        assets: [{ data_type: 'unknown', schema_version: '1', format: 'csv' }],
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        type: 'DATA_TYPE_NOT_SUPPORTED',
        dataType: 'unknown',
        schemaVersion: '1',
        format: 'csv',
      },
    })

    expect(transactionExecuteMock).not.toHaveBeenCalled()
    expect(insertRecordingMock).not.toHaveBeenCalled()
    expect(insertDataAssetMock).not.toHaveBeenCalled()
  })

  it('pedestrian と floor が存在すれば recording を作成して upload URL を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    mockEntityLookups({
      pedestrian: { id: pedestrianId, organization_id: organizationId },
      floor: { id: floorId, organization_id: organizationId },
    })
    insertRecordingMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
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

    const result = await initRecording(serviceClientActor, {
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        recording_id: recordingId,
        organization_id: organizationId,
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
      organization_id: organizationId,
      upload_targets: ['acce', 'gyro', 'metadata'],
      constraints: [],
    })
    expect(issueRecordingUploadUrlsMock).toHaveBeenCalledWith(organizationId, recordingId, [
      'acce',
      'gyro',
      'metadata',
    ])
  })

  it('指定された constraints を recording に保存する', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const recordingId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 12, y: 34, direction: 90 }]

    mockEntityLookups({
      pedestrian: { id: pedestrianId, organization_id: organizationId },
      floor: { id: floorId, organization_id: organizationId },
    })
    insertRecordingMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      upload_status: 'accepted',
    })
    issueRecordingUploadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-13T00:15:00.000Z',
      uploadUrls: {},
    })

    await initRecording(serviceClientActor, {
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
      constraints,
    })

    expect(insertRecordingMock).toHaveBeenCalledWith(expect.objectContaining({ constraints }))
  })

  it('pedestrian が存在しなければ PEDESTRIAN_NOT_FOUND を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'

    mockEntityLookups({
      pedestrian: undefined,
      floor: { id: floorId, organization_id: '99999999-9999-4999-8999-999999999999' },
    })

    const result = await initRecording(serviceClientActor, {
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
      pedestrian: { id: pedestrianId, organization_id: '99999999-9999-4999-8999-999999999999' },
      floor: undefined,
    })

    const result = await initRecording(serviceClientActor, {
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

  it('pedestrian と floor の organization が異なれば RESOURCE_ORGANIZATION_MISMATCH を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const pedestrianOrganizationId = '99999999-9999-4999-8999-999999999999'
    const floorOrganizationId = '88888888-8888-4888-8888-888888888888'

    mockEntityLookups({
      pedestrian: { id: pedestrianId, organization_id: pedestrianOrganizationId },
      floor: { id: floorId, organization_id: floorOrganizationId },
    })

    const result = await initRecording(serviceClientActor, {
      pedestrian_id: pedestrianId,
      floor_id: floorId,
      upload_targets: ['acce', 'gyro'],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RESOURCE_ORGANIZATION_MISMATCH',
        pedestrianId,
        pedestrianOrganizationId,
        floorId,
        floorOrganizationId,
      },
    })
    expect(insertRecordingMock).not.toHaveBeenCalled()
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })

  it('pedestrian lookup は service 経由で pedestrian id を参照する', async () => {
    findPedestrianByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
    })
    findFloorByIdMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      organization_id: '99999999-9999-4999-8999-999999999999',
    })

    await initRecording(serviceClientActor, {
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'gyro'],
    })

    expect(findPedestrianByIdMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(findFloorByIdMock).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
  })

  it('member が別 user の pedestrian で作成しようとすると AUTH_ORGANIZATION_FORBIDDEN を返す', async () => {
    const pedestrianId = '11111111-1111-4111-8111-111111111111'
    const floorId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    mockEntityLookups({
      pedestrian: {
        id: pedestrianId,
        organization_id: organizationId,
        user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      floor: { id: floorId, organization_id: organizationId },
    })

    const result = await initRecording(
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
      {
        pedestrian_id: pedestrianId,
        floor_id: floorId,
        upload_targets: ['acce', 'gyro'],
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })
    expect(insertRecordingMock).not.toHaveBeenCalled()
    expect(issueRecordingUploadUrlsMock).not.toHaveBeenCalled()
  })
})
