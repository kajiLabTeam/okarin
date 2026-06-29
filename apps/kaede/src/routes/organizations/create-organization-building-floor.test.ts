import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationBuildingFloorRoute } from './create-organization-building-floor.js'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const { createFloorMock } = vi.hoisted(() => ({
  createFloorMock: vi.fn(),
}))

vi.mock('../../usecases/floors/create-floor.js', () => ({
  createFloor: createFloorMock,
}))

describe('POST /api/organizations/:organizationId/buildings/:buildingId/floors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization 内 building に floor を作成して返す', async () => {
    createFloorMock.mockResolvedValue({
      ok: true,
      value: {
        floor_id: '33333333-3333-4333-8333-333333333333',
        building_id: '22222222-2222-4222-8222-222222222222',
        organization_id: '99999999-9999-4999-8999-999999999999',
        building_name: 'Test Building',
        level: 1,
        name: '1F',
        scale: null,
        map_image: {
          download_url: 'https://storage.example.test/maps/floor.png',
          download_expires_at: '2026-05-13T01:00:00.000Z',
        },
        map_upload: {
          url: 'https://storage.example.test/maps/floor.png?upload',
          expires_at: '2026-05-13T00:15:00.000Z',
        },
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          level: 1,
          name: '1F',
        }),
      }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      floor_id: '33333333-3333-4333-8333-333333333333',
      building_id: '22222222-2222-4222-8222-222222222222',
      organization_id: '99999999-9999-4999-8999-999999999999',
      building_name: 'Test Building',
      level: 1,
      name: '1F',
      scale: null,
      map_image: {
        download_url: 'https://storage.example.test/maps/floor.png',
        download_expires_at: '2026-05-13T01:00:00.000Z',
      },
      map_upload: {
        url: 'https://storage.example.test/maps/floor.png?upload',
        expires_at: '2026-05-13T00:15:00.000Z',
      },
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })
    expect(createFloorMock).toHaveBeenCalledWith(
      managerActor,
      '99999999-9999-4999-8999-999999999999',
      '22222222-2222-4222-8222-222222222222',
      {
        level: 1,
        name: '1F',
      }
    )
  })

  it('building がない場合は 404 を返す', async () => {
    createFloorMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId: '22222222-2222-4222-8222-222222222222',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          level: 1,
          name: '1F',
        }),
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'BUILDING_NOT_FOUND',
      error_message: 'building not found',
      details: {
        building_id: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it('name がない場合は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          level: 1,
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(createFloorMock).not.toHaveBeenCalled()
  })

  it('map_image_extension が png/svg 以外なら 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          level: 1,
          name: '1F',
          map_image_extension: 'jpg',
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(createFloorMock).not.toHaveBeenCalled()
  })
})
