import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetBuildingRoute } from './get-building.js'

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const { getBuildingMock } = vi.hoisted(() => ({
  getBuildingMock: vi.fn(),
}))

vi.mock('../../usecases/buildings/get-building.js', () => ({
  getBuilding: getBuildingMock,
}))

describe('GET /api/buildings/:buildingId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('building 詳細を返す', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'
    getBuildingMock.mockResolvedValue({
      ok: true,
      value: {
        building_id: buildingId,
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
        latitude: 35.681236,
        longitude: 139.767125,
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/buildings', registerGetBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request(`/api/buildings/${buildingId}`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      building_id: buildingId,
      organization_id: '99999999-9999-4999-8999-999999999999',
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })
    expect(getBuildingMock).toHaveBeenCalledWith(serviceClientActor, {
      buildingId,
    })
  })

  it('存在しない building は 404 を返す', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'
    getBuildingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    })

    const app = createRouteTestApp('/buildings', registerGetBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request(`/api/buildings/${buildingId}`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'BUILDING_NOT_FOUND',
      error_message: 'building not found',
      details: {
        building_id: buildingId,
      },
    })
  })

  it('不正な path は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/buildings', registerGetBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings/not-a-uuid')

    expect(response.status).toBe(400)
    expect(getBuildingMock).not.toHaveBeenCalled()
  })
})
