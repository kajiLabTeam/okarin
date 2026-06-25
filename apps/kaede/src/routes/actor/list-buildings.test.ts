import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListActorBuildingsRoute } from './list-buildings.js'

const userActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  password_must_change: false,
  memberships: [],
}

const { listBuildingsMock } = vi.hoisted(() => ({
  listBuildingsMock: vi.fn(),
}))

vi.mock('../../usecases/buildings/list-buildings.js', () => ({
  listBuildings: listBuildingsMock,
}))

describe('GET /api/actor/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('actor がアクセス可能な building 一覧を返す', async () => {
    listBuildingsMock.mockResolvedValue({
      buildings: [
        {
          building_id: '22222222-2222-4222-8222-222222222222',
          organization_id: '99999999-9999-4999-8999-999999999999',
          name: 'Test Building',
          latitude: 35.681236,
          longitude: 139.767125,
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })

    const app = createRouteTestApp('/actor', registerListActorBuildingsRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/actor/buildings')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      buildings: [
        {
          building_id: '22222222-2222-4222-8222-222222222222',
          organization_id: '99999999-9999-4999-8999-999999999999',
          name: 'Test Building',
          latitude: 35.681236,
          longitude: 139.767125,
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })
    expect(listBuildingsMock).toHaveBeenCalledWith(userActor)
  })
})
