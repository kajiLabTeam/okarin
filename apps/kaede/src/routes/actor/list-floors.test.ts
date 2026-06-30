import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListActorFloorsRoute } from './list-floors.js'

const userActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const { listFloorsMock } = vi.hoisted(() => ({
  listFloorsMock: vi.fn(),
}))

vi.mock('../../usecases/floors/list-floors.js', () => ({
  listFloors: listFloorsMock,
}))

describe('GET /api/actor/floors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('actor がアクセス可能な floor 一覧を building 情報とあわせて返す', async () => {
    listFloorsMock.mockResolvedValue({
      floors: [
        {
          floor_id: '22222222-2222-4222-8222-222222222222',
          building_id: '11111111-1111-4111-8111-111111111111',
          organization_id: '99999999-9999-4999-8999-999999999999',
          building_name: 'Test Building',
          level: 1,
          name: '1F',
          scale: null,
          map_image: {
            download_url: 'https://storage.example.test/maps/floor.png',
            download_expires_at: '2026-05-13T01:00:00.000Z',
            content_type: 'image/png',
            extension: 'png',
          },
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })

    const app = createRouteTestApp('/actor', registerListActorFloorsRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/actor/floors')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      floors: [
        {
          floor_id: '22222222-2222-4222-8222-222222222222',
          building_id: '11111111-1111-4111-8111-111111111111',
          organization_id: '99999999-9999-4999-8999-999999999999',
          building_name: 'Test Building',
          level: 1,
          name: '1F',
          scale: null,
          map_image: {
            download_url: 'https://storage.example.test/maps/floor.png',
            download_expires_at: '2026-05-13T01:00:00.000Z',
            content_type: 'image/png',
            extension: 'png',
          },
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })
    expect(listFloorsMock).toHaveBeenCalledWith(userActor)
  })
})
