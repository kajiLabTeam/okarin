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
  floorMapImageMaxBytes: 10 * 1024 * 1024,
}))

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const createFloorFormData = (
  overrides: { includeName?: boolean; name?: string; mapImage?: File } = {}
) => {
  const formData = new FormData()
  formData.set('level', '1')

  if (overrides.includeName !== false) {
    formData.set('name', overrides.name ?? '1F')
  }

  formData.set(
    'map_image',
    overrides.mapImage ?? new File([pngBytes], 'map.png', { type: 'image/png' })
  )

  return formData
}

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
          content_type: 'image/png',
          extension: 'png',
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
        body: createFloorFormData(),
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
        content_type: 'image/png',
        extension: 'png',
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
        scale: null,
      },
      {
        bytes: pngBytes,
        contentType: 'image/png',
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
        body: createFloorFormData(),
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

  it('JSON body では 400 を返し usecase を呼ばない', async () => {
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

  it('name がない場合は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        body: createFloorFormData({ includeName: false }),
      }
    )

    expect(response.status).toBe(400)
    expect(createFloorMock).not.toHaveBeenCalled()
  })

  it('map_image が png/svg 以外なら 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings/22222222-2222-4222-8222-222222222222/floors',
      {
        method: 'POST',
        body: createFloorFormData({
          mapImage: new File(['jpg'], 'map.jpg', { type: 'image/jpeg' }),
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(createFloorMock).not.toHaveBeenCalled()
  })
})
