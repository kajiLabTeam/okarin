import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallbackRuntimeConfig } from '../config/runtime.js'
import type { RequestActor } from '../middleware/request-actor-context.js'

const {
  findFloorByIdMock,
  findRecordingAuthorizationByIdMock,
  findRecordingByIdMock,
  insertTrajectoryWithConstraintsMock,
  markTrajectoryFailedMock,
  markTrajectoryProcessingMock,
  issueInternalRecordingRawDownloadUrlsMock,
  issueInternalTrajectoryResultUploadUrlMock,
  submitAnalyzeRequestMock,
  generateCallbackTokenMock,
  getCallbackRuntimeConfigMock,
} = vi.hoisted(() => ({
  findFloorByIdMock: vi.fn(),
  findRecordingAuthorizationByIdMock: vi.fn(),
  findRecordingByIdMock: vi.fn(),
  insertTrajectoryWithConstraintsMock: vi.fn(),
  markTrajectoryFailedMock: vi.fn(),
  markTrajectoryProcessingMock: vi.fn(),
  issueInternalRecordingRawDownloadUrlsMock: vi.fn(),
  issueInternalTrajectoryResultUploadUrlMock: vi.fn(),
  submitAnalyzeRequestMock: vi.fn(),
  generateCallbackTokenMock: vi.fn(),
  getCallbackRuntimeConfigMock: vi.fn<() => CallbackRuntimeConfig>(),
}))

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

vi.mock('../services/recordings/index.js', () => ({
  findRecordingAuthorizationById: findRecordingAuthorizationByIdMock,
  findRecordingById: findRecordingByIdMock,
}))

vi.mock('../services/floors/index.js', () => ({
  findFloorById: findFloorByIdMock,
}))

vi.mock('../services/trajectories/index.js', () => ({
  insertTrajectoryWithConstraints: insertTrajectoryWithConstraintsMock,
  markTrajectoryFailed: markTrajectoryFailedMock,
  markTrajectoryProcessing: markTrajectoryProcessingMock,
}))

vi.mock('../services/storage/index.js', () => ({
  issueInternalRecordingRawDownloadUrls: issueInternalRecordingRawDownloadUrlsMock,
  issueInternalTrajectoryResultUploadUrl: issueInternalTrajectoryResultUploadUrlMock,
}))

vi.mock('../services/nozomi/index.js', () => ({
  submitAnalyzeRequest: submitAnalyzeRequestMock,
}))

vi.mock('../services/trajectories/callback-token.js', () => ({
  generateCallbackToken: generateCallbackTokenMock,
}))

vi.mock('../config/runtime.js', () => ({
  getCallbackRuntimeConfig: getCallbackRuntimeConfigMock,
}))

import { createTrajectory } from './create-trajectory.js'

const serviceClientActor: RequestActor = { type: 'service_client', name: 'shared_token' }

describe('createTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCallbackRuntimeConfigMock.mockReturnValue({
      baseUrl: 'http://kaede:8080',
      tokenSecret: 'test-callback-secret',
      tokenTtlSeconds: 3600,
    })
  })

  it('ready な recording から processing trajectory を作成する', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    const floorId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: organizationId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findFloorByIdMock.mockResolvedValue({
      id: floorId,
      organization_id: organizationId,
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '44444444-4444-4444-8444-444444444444',
      pedestrian_user_id: null,
    })
    insertTrajectoryWithConstraintsMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      floor_id: floorId,
      organization_id: organizationId,
      status: 'accepted',
    })
    issueInternalRecordingRawDownloadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      rawDataUrls: {
        acce: 'http://seaweedfs:8333/acce',
        gyro: 'http://seaweedfs:8333/gyro',
      },
    })
    markTrajectoryProcessingMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      organization_id: organizationId,
      status: 'processing',
    })
    issueInternalTrajectoryResultUploadUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      uploadUrl: 'http://seaweedfs:8333/result',
      objectKey: `trajectories/${trajectoryId}/analyzed/result.csv`,
    })
    generateCallbackTokenMock.mockReturnValue('signed-callback-token')
    submitAnalyzeRequestMock.mockResolvedValue({
      trajectory_id: trajectoryId,
      status: 'accepted',
    })

    const result = await createTrajectory(
      serviceClientActor,
      { recordingId },
      {
        constraints: [],
      }
    )

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        recording_id: recordingId,
        organization_id: organizationId,
        status: 'processing',
      },
    })
    expect(insertTrajectoryWithConstraintsMock).toHaveBeenCalledWith(
      {
        recording_id: recordingId,
        floor_id: floorId,
        organization_id: organizationId,
        status: 'accepted',
      },
      []
    )
    expect(markTrajectoryProcessingMock).toHaveBeenCalledWith(trajectoryId)
    expect(submitAnalyzeRequestMock).toHaveBeenCalledWith({
      trajectory_id: trajectoryId,
      recording_id: recordingId,
      floor_id: floorId,
      constraints: [],
      raw_data_urls: {
        acce: 'http://seaweedfs:8333/acce',
        gyro: 'http://seaweedfs:8333/gyro',
      },
      result_upload_url: 'http://seaweedfs:8333/result',
      callback_url: 'http://kaede:8080/api/trajectories/callback',
      callback_token: 'signed-callback-token',
    })
  })

  it('member が他 user の recording から trajectory を作成しようとすると AUTH_ORGANIZATION_FORBIDDEN を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const floorId = '33333333-3333-4333-8333-333333333333'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: organizationId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '44444444-4444-4444-8444-444444444444',
      pedestrian_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
    findFloorByIdMock.mockResolvedValue({
      id: floorId,
      organization_id: organizationId,
    })

    const result = await createTrajectory(
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
      { constraints: [] }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })
    expect(insertTrajectoryWithConstraintsMock).not.toHaveBeenCalled()
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })

  it('存在しない recording は 404 相当エラーを返す', async () => {
    findRecordingByIdMock.mockResolvedValue(undefined)

    const result = await createTrajectory(
      serviceClientActor,
      { recordingId: '11111111-1111-4111-8111-111111111111' },
      { constraints: [] }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  it('ready でない recording は 409 相当エラーを返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '99999999-9999-4999-8999-999999999999',
      upload_status: 'accepted',
      upload_targets: ['acce', 'gyro'],
    })

    const result = await createTrajectory(
      serviceClientActor,
      { recordingId: '11111111-1111-4111-8111-111111111111' },
      { constraints: [] }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_NOT_READY',
        recordingId: '11111111-1111-4111-8111-111111111111',
        uploadStatus: 'accepted',
      },
    })
  })

  it('壊れた upload_targets は 500 相当エラーを返す', async () => {
    findRecordingByIdMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '99999999-9999-4999-8999-999999999999',
      upload_status: 'ready',
      upload_targets: ['acce'],
    })

    const result = await createTrajectory(
      serviceClientActor,
      { recordingId: '11111111-1111-4111-8111-111111111111' },
      { constraints: [] }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId: '11111111-1111-4111-8111-111111111111',
        invalidTargets: ['acce'],
      },
    })
  })

  it('recording の floor が存在しなければ FLOOR_NOT_FOUND を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const floorId = '33333333-3333-4333-8333-333333333333'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: '99999999-9999-4999-8999-999999999999',
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findFloorByIdMock.mockResolvedValue(undefined)

    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: '99999999-9999-4999-8999-999999999999',
      pedestrian_id: '44444444-4444-4444-8444-444444444444',
      pedestrian_user_id: null,
    })

    const result = await createTrajectory(serviceClientActor, { recordingId }, { constraints: [] })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        recordingId,
        floorId,
      },
    })
    expect(insertTrajectoryWithConstraintsMock).not.toHaveBeenCalled()
  })

  it('recording と floor の organization が異なれば RESOURCE_ORGANIZATION_MISMATCH を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const floorId = '33333333-3333-4333-8333-333333333333'
    const recordingOrganizationId = '99999999-9999-4999-8999-999999999999'
    const floorOrganizationId = '88888888-8888-4888-8888-888888888888'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: recordingOrganizationId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findFloorByIdMock.mockResolvedValue({
      id: floorId,
      organization_id: floorOrganizationId,
    })

    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: recordingOrganizationId,
      pedestrian_id: '44444444-4444-4444-8444-444444444444',
      pedestrian_user_id: null,
    })

    const result = await createTrajectory(serviceClientActor, { recordingId }, { constraints: [] })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'RESOURCE_ORGANIZATION_MISMATCH',
        recordingId,
        recordingOrganizationId,
        floorId,
        floorOrganizationId,
      },
    })
    expect(insertTrajectoryWithConstraintsMock).not.toHaveBeenCalled()
  })

  it('nozomi 依頼失敗時は failed にして 502 相当エラーを返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findFloorByIdMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
    })
    insertTrajectoryWithConstraintsMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
      status: 'accepted',
    })
    markTrajectoryProcessingMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      organization_id: organizationId,
      status: 'processing',
    })
    issueInternalRecordingRawDownloadUrlsMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      rawDataUrls: {
        acce: 'http://seaweedfs:8333/acce',
        gyro: 'http://seaweedfs:8333/gyro',
      },
    })
    issueInternalTrajectoryResultUploadUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      uploadUrl: 'http://seaweedfs:8333/result',
      objectKey: `trajectories/${trajectoryId}/analyzed/result.csv`,
    })
    generateCallbackTokenMock.mockReturnValue('signed-callback-token')
    submitAnalyzeRequestMock.mockRejectedValue(new Error('boom'))
    markTrajectoryFailedMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      status: 'failed',
    })

    findRecordingAuthorizationByIdMock.mockResolvedValue({
      id: recordingId,
      organization_id: organizationId,
      pedestrian_id: '44444444-4444-4444-8444-444444444444',
      pedestrian_user_id: null,
    })

    const result = await createTrajectory(serviceClientActor, { recordingId }, { constraints: [] })

    expect(markTrajectoryFailedMock).toHaveBeenCalledWith(
      trajectoryId,
      'NOZOMI_REQUEST_FAILED',
      'failed to submit analyze request to nozomi'
    )
    expect(result).toEqual({
      ok: false,
      error: {
        type: 'NOZOMI_REQUEST_FAILED',
        recordingId,
        trajectoryId,
      },
    })
  })

  it('解析依頼準備失敗時は failed にして 500 相当エラーを返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    const organizationId = '99999999-9999-4999-8999-999999999999'

    findRecordingByIdMock.mockResolvedValue({
      id: recordingId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
    })
    findFloorByIdMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
    })
    insertTrajectoryWithConstraintsMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      floor_id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
      status: 'accepted',
    })
    markTrajectoryProcessingMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      organization_id: organizationId,
      status: 'processing',
    })
    issueInternalRecordingRawDownloadUrlsMock.mockRejectedValue(new Error('presign failed'))
    markTrajectoryFailedMock.mockResolvedValue({
      id: trajectoryId,
      recording_id: recordingId,
      status: 'failed',
    })

    const result = await createTrajectory(serviceClientActor, { recordingId }, { constraints: [] })

    expect(markTrajectoryFailedMock).toHaveBeenCalledWith(
      trajectoryId,
      'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
      'failed to prepare analyze request'
    )
    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_ANALYZE_PREPARATION_FAILED',
        recordingId,
        trajectoryId,
      },
    })
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })
})
