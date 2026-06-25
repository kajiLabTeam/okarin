import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListBuildingsRoute } from './list-buildings.js'

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const { listBuildingsMock } = vi.hoisted(() => ({
  listBuildingsMock: vi.fn(),
}))

vi.mock('../../usecases/buildings/list-buildings.js', () => ({
  listBuildings: listBuildingsMock,
}))

describe('GET /api/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('building 一覧を返す', async () => {
    listBuildingsMock.mockResolvedValue({
      ok: true,
      value: {
        buildings: [
          {
            building_id: '11111111-1111-4111-8111-111111111111',
            organization_id: '99999999-9999-4999-8999-999999999999',
            name: 'Test Building',
            latitude: 35.681236,
            longitude: 139.767125,
            created_at: '2026-05-13T00:00:00.000Z',
            updated_at: '2026-05-13T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/buildings', registerListBuildingsRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      buildings: [
        {
          building_id: '11111111-1111-4111-8111-111111111111',
          organization_id: '99999999-9999-4999-8999-999999999999',
          name: 'Test Building',
          latitude: 35.681236,
          longitude: 139.767125,
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })
    expect(listBuildingsMock).toHaveBeenCalledWith(serviceClientActor)
  })

  it('dashboard 権限がない場合は 403 を返す', async () => {
    listBuildingsMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/buildings', registerListBuildingsRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })
})
