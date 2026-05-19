import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  doesTrajectoryAnalyzedResultObjectExistMock,
  findTrajectoryByIdMock,
  markTrajectoryCompletedMock,
  markTrajectoryFailedMock,
  verifyCallbackTokenMock,
} = vi.hoisted(() => ({
  doesTrajectoryAnalyzedResultObjectExistMock: vi.fn(),
  findTrajectoryByIdMock: vi.fn(),
  markTrajectoryCompletedMock: vi.fn(),
  markTrajectoryFailedMock: vi.fn(),
  verifyCallbackTokenMock: vi.fn(),
}))

vi.mock('../services/storage/index.js', () => ({
  buildTrajectoryAnalyzedResultObjectKey: (trajectoryId: string) =>
    `trajectories/${trajectoryId}/analyzed/result.csv`,
  doesTrajectoryAnalyzedResultObjectExist: doesTrajectoryAnalyzedResultObjectExistMock,
}))

vi.mock('../services/trajectories/index.js', () => ({
  findTrajectoryById: findTrajectoryByIdMock,
  markTrajectoryCompleted: markTrajectoryCompletedMock,
  markTrajectoryFailed: markTrajectoryFailedMock,
  verifyCallbackToken: verifyCallbackTokenMock,
}))

import { receiveCallback } from './receive-callback.js'

describe('receiveCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completed callback を受理して completed に更新する', async () => {
    const trajectoryId = '11111111-1111-4111-8111-111111111111'

    verifyCallbackTokenMock.mockReturnValue({
      ok: true,
      value: {
        trajectoryId,
        exp: 9999999999,
      },
    })
    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      status: 'processing',
      error_code: null,
      error_message: null,
    })
    doesTrajectoryAnalyzedResultObjectExistMock.mockResolvedValue(true)
    markTrajectoryCompletedMock.mockResolvedValue({
      id: trajectoryId,
      status: 'completed',
    })

    const result = await receiveCallback({
      trajectory_id: trajectoryId,
      status: 'completed',
      callback_token: 'signed-token',
      result_object_key: `trajectories/${trajectoryId}/analyzed/result.csv`,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        status: 'completed',
      },
    })
  })

  it('token と body の trajectory_id が不一致なら 409 相当を返す', async () => {
    verifyCallbackTokenMock.mockReturnValue({
      ok: true,
      value: {
        trajectoryId: '22222222-2222-4222-8222-222222222222',
        exp: 9999999999,
      },
    })

    const result = await receiveCallback({
      trajectory_id: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      callback_token: 'signed-token',
      error_code: 'ANALYSIS_FAILED',
      error_message: 'trajectory estimation failed',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'CALLBACK_TRAJECTORY_MISMATCH',
        trajectoryId: '11111111-1111-4111-8111-111111111111',
        tokenTrajectoryId: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it('result object が見つからなければ 503 相当を返す', async () => {
    const trajectoryId = '11111111-1111-4111-8111-111111111111'

    verifyCallbackTokenMock.mockReturnValue({
      ok: true,
      value: {
        trajectoryId,
        exp: 9999999999,
      },
    })
    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      status: 'processing',
      error_code: null,
      error_message: null,
    })
    doesTrajectoryAnalyzedResultObjectExistMock.mockResolvedValue(false)

    const result = await receiveCallback({
      trajectory_id: trajectoryId,
      status: 'completed',
      callback_token: 'signed-token',
      result_object_key: `trajectories/${trajectoryId}/analyzed/result.csv`,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'CALLBACK_DEPENDENCY_FAILURE',
        trajectoryId,
      },
    })
  })

  it('failed callback を受理して failed に更新する', async () => {
    const trajectoryId = '11111111-1111-4111-8111-111111111111'

    verifyCallbackTokenMock.mockReturnValue({
      ok: true,
      value: {
        trajectoryId,
        exp: 9999999999,
      },
    })
    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      status: 'processing',
      error_code: null,
      error_message: null,
    })
    markTrajectoryFailedMock.mockResolvedValue({
      id: trajectoryId,
      status: 'failed',
      error_code: 'ANALYSIS_FAILED',
      error_message: 'trajectory estimation failed',
    })

    const result = await receiveCallback({
      trajectory_id: trajectoryId,
      status: 'failed',
      callback_token: 'signed-token',
      error_code: 'ANALYSIS_FAILED',
      error_message: 'trajectory estimation failed',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        status: 'failed',
      },
    })
  })

  it('期限切れ token は 401 相当を返す', async () => {
    verifyCallbackTokenMock.mockReturnValue({
      ok: false,
      error: 'CALLBACK_TOKEN_EXPIRED',
    })

    const result = await receiveCallback({
      trajectory_id: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      callback_token: 'signed-token',
      error_code: 'ANALYSIS_FAILED',
      error_message: 'trajectory estimation failed',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'CALLBACK_TOKEN_EXPIRED',
      },
    })
  })
})
