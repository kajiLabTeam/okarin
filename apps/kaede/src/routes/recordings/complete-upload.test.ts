import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCompleteUploadRoute } from './complete-upload.js'

const { completeUploadMock } = vi.hoisted(() => ({
  completeUploadMock: vi.fn(),
}))

vi.mock('../../usecases/complete-upload.js', () => ({
  completeUpload: completeUploadMock,
}))

describe('POST /api/recordings/:recordingId/complete-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upload 完了を ready として返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    completeUploadMock.mockResolvedValue({
      ok: true,
      value: {
        recording_id: recordingId,
        upload_status: 'ready',
      },
    })

    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'ready',
    })
    expect(completeUploadMock).toHaveBeenCalledWith({
      recordingId,
    })
  })

  it('不足 target がある場合は 409 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    completeUploadMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'UPLOAD_TARGETS_MISSING',
        recordingId,
        missingTargets: ['gyro'],
      },
    })

    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UPLOAD_TARGETS_MISSING',
      error_message: 'some upload targets are missing',
      details: {
        recording_id: recordingId,
        missing_targets: ['gyro'],
      },
    })
  })

  it('終端状態は 409 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    completeUploadMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_FINALIZED',
        recordingId,
        uploadStatus: 'failed',
      },
    })

    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_FINALIZED',
      error_message: 'recording is already in a terminal upload state',
      details: {
        recording_id: recordingId,
        upload_status: 'failed',
      },
    })
  })

  it('存在しない recording は 404 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    completeUploadMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_NOT_FOUND',
        recordingId,
      },
    })

    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_FOUND',
      error_message: 'recording not found',
      details: {
        recording_id: recordingId,
      },
    })
  })

  it('壊れた upload_targets は 500 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    completeUploadMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_UPLOAD_TARGETS_INVALID',
        recordingId,
        invalidTargets: ['broken-target'],
      },
    })

    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_UPLOAD_TARGETS_INVALID',
      error_message: 'recording upload_targets contains invalid values',
      details: {
        recording_id: recordingId,
        invalid_targets: ['broken-target'],
      },
    })
  })

  it('不正な path は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/recordings', registerCompleteUploadRoute)
    const response = await app.request('/api/recordings/not-a-uuid/complete-upload', {
      method: 'POST',
    })

    expect(response.status).toBe(400)
    expect(completeUploadMock).not.toHaveBeenCalled()
  })
})
