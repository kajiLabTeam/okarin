import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateBuildingRoute } from './create-building.js'

const serviceClientActor = {
  type: 'service_client',
  name: 'shared_token',
} as const

const { createBuildingMock } = vi.hoisted(() => ({
  createBuildingMock: vi.fn(),
}))

vi.mock('../../usecases/buildings/create-building.js', () => ({
  createBuilding: createBuildingMock,
}))

describe('POST /api/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('building を作成して返す', async () => {
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

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
        latitude: 35.681236,
        longitude: 139.767125,
      }),
    })

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

    expect(createBuildingMock).toHaveBeenCalledWith(serviceClientActor, {
      organization_id: '99999999-9999-4999-8999-999999999999',
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
    })
  })

  it('name だけで building を作成できる', async () => {
    createBuildingMock.mockResolvedValue({
      ok: true,
      value: {
        building_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
        latitude: null,
        longitude: null,
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      name: 'Test Building',
      latitude: null,
      longitude: null,
    })

    expect(createBuildingMock).toHaveBeenCalledWith(serviceClientActor, {
      organization_id: '99999999-9999-4999-8999-999999999999',
      name: 'Test Building',
    })
  })

  it('存在しない organization_id は 404 を返す', async () => {
    createBuildingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId: '99999999-9999-4999-8999-999999999999',
      },
    })

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
      details: {
        organization_id: '99999999-9999-4999-8999-999999999999',
      },
    })
  })

  it('dashboard write 権限がない場合は 403 を返す', async () => {
    createBuildingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })

  it('organization 権限がない場合は 403 を返す', async () => {
    createBuildingMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_ORGANIZATION_FORBIDDEN',
      error_message: 'organization access forbidden',
    })
  })

  it('name がない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute)
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(createBuildingMock).not.toHaveBeenCalled()
  })

  it('organization_id がない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute)
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(400)
    expect(createBuildingMock).not.toHaveBeenCalled()
  })

  it('organization_id が UUID 形式でない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute)
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: 'invalid-organization-id',
        name: 'Test Building',
      }),
    })

    expect(response.status).toBe(400)
    expect(createBuildingMock).not.toHaveBeenCalled()
  })
})
