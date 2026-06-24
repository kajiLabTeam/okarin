import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetFloorRoute } from './get-floor.js'

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const { getFloorMock } = vi.hoisted(() => ({
  getFloorMock: vi.fn(),
}))

vi.mock('../../usecases/floors/get-floor.js', () => ({
  getFloor: getFloorMock,
}))

describe('GET /api/floors/:floorId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('floor 詳細を building 情報とあわせて返す', async () => {
    const floorId = '22222222-2222-4222-8222-222222222222'
    getFloorMock.mockResolvedValue({
      ok: true,
      value: {
        floor_id: floorId,
        building_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '99999999-9999-4999-8999-999999999999',
        building_name: 'Test Building',
        level: 1,
        name: '1F',
        scale: null,
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/floors', registerGetFloorRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request(`/api/floors/${floorId}`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      floor_id: floorId,
      building_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      building_name: 'Test Building',
      level: 1,
      name: '1F',
      scale: null,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })
    expect(getFloorMock).toHaveBeenCalledWith(serviceClientActor, {
      floorId,
    })
  })

  it('存在しない floor は 404 を返す', async () => {
    const floorId = '22222222-2222-4222-8222-222222222222'
    getFloorMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'FLOOR_NOT_FOUND',
        floorId,
      },
    })

    const app = createRouteTestApp('/floors', registerGetFloorRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request(`/api/floors/${floorId}`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'FLOOR_NOT_FOUND',
      error_message: 'floor not found',
      details: {
        floor_id: floorId,
      },
    })
  })

  it('不正な path は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/floors', registerGetFloorRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/floors/not-a-uuid')

    expect(response.status).toBe(400)
    expect(getFloorMock).not.toHaveBeenCalled()
  })
})
