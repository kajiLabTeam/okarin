import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const {
  findFloorByIdMock,
  findPedestrianByIdMock,
  insertRecordingMock,
  issueRecordingUploadUrlsMock,
} = vi.hoisted(() => ({
  findFloorByIdMock: vi.fn(),
  findPedestrianByIdMock: vi.fn(),
  insertRecordingMock: vi.fn(),
  issueRecordingUploadUrlsMock: vi.fn(),
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

vi.mock('../../services/storage/index.js', () => ({
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
