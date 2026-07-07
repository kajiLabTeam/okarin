import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerUpdateRecordingConstraintsRoute } from './update-recording-constraints.js'

const actor: RequestActor = {
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.test',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}
const { updateRecordingConstraintsMock } = vi.hoisted(() => ({
  updateRecordingConstraintsMock: vi.fn(),
}))

vi.mock('../../usecases/recordings/update-recording-constraints.js', () => ({
  updateRecordingConstraints: updateRecordingConstraintsMock,
}))

describe('PUT /api/recordings/:recordingId/constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constraints を全置換する', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'
    const constraints = [{ seq: 0, point_type: 'start', x: 10, y: 20 }]
    updateRecordingConstraintsMock.mockResolvedValue({
      ok: true,
      value: { recording_id: recordingId, constraints },
    })
    const app = createRouteTestApp('/recordings', registerUpdateRecordingConstraintsRoute, {
      actor,
    })

    const response = await app.request(`/api/recordings/${recordingId}/constraints`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ constraints }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ recording_id: recordingId, constraints })
    expect(updateRecordingConstraintsMock).toHaveBeenCalledWith(
      actor,
      { recordingId },
      { constraints }
    )
  })

  it.each([{}, { constraints: null }])('不正な body %# は 400 を返す', async (body) => {
    const app = createRouteTestApp('/recordings', registerUpdateRecordingConstraintsRoute)

    const response = await app.request(
      '/api/recordings/11111111-1111-4111-8111-111111111111/constraints',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    expect(response.status).toBe(400)
    expect(updateRecordingConstraintsMock).not.toHaveBeenCalled()
  })
})
