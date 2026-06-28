import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationBuildingRoute } from './create-organization-building.js'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const { createBuildingMock } = vi.hoisted(() => ({
  createBuildingMock: vi.fn(),
}))

vi.mock('../../usecases/buildings/create-building.js', () => ({
  createBuilding: createBuildingMock,
}))

describe('POST /api/organizations/:organizationId/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization に building を作成して返す', async () => {
    createBuildingMock.mockResolvedValue({
      ok: true,
      value: {
        building_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
        latitude: 35.681236,
        longitude: 139.767125,
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          name: 'Test Building',
          latitude: 35.681236,
          longitude: 139.767125,
        }),
      }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      building_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })
    expect(createBuildingMock).toHaveBeenCalledWith(
      managerActor,
      '99999999-9999-4999-8999-999999999999',
      {
        name: 'Test Building',
        latitude: 35.681236,
        longitude: 139.767125,
      }
    )
  })

  it('organization がない場合は 404 を返す', async () => {
    createBuildingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId: '99999999-9999-4999-8999-999999999999',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Building',
        }),
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
      details: {
        organization_id: '99999999-9999-4999-8999-999999999999',
      },
    })
  })

  it('name がない場合は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationBuildingRoute, {
      actor: managerActor,
    })
    const response = await app.request(
      '/api/organizations/99999999-9999-4999-8999-999999999999/buildings',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    )

    expect(response.status).toBe(400)
    expect(createBuildingMock).not.toHaveBeenCalled()
  })
})
