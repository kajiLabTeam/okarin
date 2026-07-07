import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetRecordingConstraintsRoute } from './get-recording-constraints.js'

const actor = { type: 'service_client', name: 'shared_token' } as const
const { getRecordingConstraintsMock } = vi.hoisted(() => ({
  getRecordingConstraintsMock: vi.fn(),
}))

vi.mock('../../usecases/recordings/get-recording-constraints.js', () => ({
  getRecordingConstraints: getRecordingConstraintsMock,
}))

describe('GET /api/recordings/:recordingId/constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recording constraints を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const constraints = [{ seq: 0, point_type: 'start', x: 10, y: 20 }]
    getRecordingConstraintsMock.mockResolvedValue({
      ok: true,
      value: { recording_id: recordingId, constraints },
    })
    const app = createRouteTestApp('/recordings', registerGetRecordingConstraintsRoute, { actor })

    const response = await app.request(`/api/recordings/${recordingId}/constraints`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ recording_id: recordingId, constraints })
    expect(getRecordingConstraintsMock).toHaveBeenCalledWith(actor, { recordingId })
  })

  it('DB constraints が不正なら 500 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    getRecordingConstraintsMock.mockResolvedValue({
      ok: false,
      error: { type: 'RECORDING_CONSTRAINTS_INVALID', recordingId },
    })
    const app = createRouteTestApp('/recordings', registerGetRecordingConstraintsRoute, { actor })

    const response = await app.request(`/api/recordings/${recordingId}/constraints`)

    expect(response.status).toBe(500)
  })
})
