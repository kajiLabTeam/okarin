import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetRecordingRawRoute } from './get-recording-raw.js'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: '11111111-1111-4111-8111-111111111111',
      organization_name: 'Group A',
      role: 'manager',
    },
  ],
}

const { getRecordingRawMock } = vi.hoisted(() => ({
  getRecordingRawMock: vi.fn(),
}))

vi.mock('../../usecases/recordings/get-recording-raw.js', () => ({
  getRecordingRaw: getRecordingRawMock,
}))

describe('GET /api/recordings/:recordingId/raw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording raw download URL を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    getRecordingRawMock.mockResolvedValue({
      ok: true,
      value: {
        recording_id: recordingId,
        download_urls: {
          acce: 'https://storage.example.test/acce.csv',
          gyro: 'https://storage.example.test/gyro.csv',
        },
        expires_at: '2026-07-31T00:15:00.000Z',
      },
    })

    const app = createRouteTestApp('/recordings', registerGetRecordingRawRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/recordings/${recordingId}/raw`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      download_urls: {
        acce: 'https://storage.example.test/acce.csv',
        gyro: 'https://storage.example.test/gyro.csv',
      },
      expires_at: '2026-07-31T00:15:00.000Z',
    })
  })

  it('raw ファイルが存在しない場合は 409 を返す', async () => {
    const recordingId = '22222222-2222-4222-8222-222222222222'
    getRecordingRawMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'RECORDING_RAW_NOT_FOUND',
        recordingId,
      },
    })

    const app = createRouteTestApp('/recordings', registerGetRecordingRawRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/recordings/${recordingId}/raw`)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_RAW_NOT_FOUND',
      error_message: 'recording raw data not found',
      details: {
        recording_id: recordingId,
      },
    })
  })
})
