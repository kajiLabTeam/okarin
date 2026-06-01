import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateBuildingRoute } from './create-building.js'

const { createBuildingMock } = vi.hoisted(() => ({
  createBuildingMock: vi.fn(),
}))

vi.mock('../../usecases/create-building.js', () => ({
  createBuilding: createBuildingMock,
}))

describe('POST /api/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('building を作成して返す', async () => {
    createBuildingMock.mockResolvedValue({
      building_id: '11111111-1111-4111-8111-111111111111',
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })

    const app = createRouteTestApp('/buildings', registerCreateBuildingRoute)
    const response = await app.request('/api/buildings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Building',
        latitude: 35.681236,
        longitude: 139.767125,
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      building_id: '11111111-1111-4111-8111-111111111111',
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })

    expect(createBuildingMock).toHaveBeenCalledWith({
      name: 'Test Building',
      latitude: 35.681236,
      longitude: 139.767125,
    })
  })

  it('name だけで building を作成できる', async () => {
    createBuildingMock.mockResolvedValue({
      building_id: '11111111-1111-4111-8111-111111111111',
      name: 'Test Building',
      latitude: null,
      longitude: null,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })

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

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      name: 'Test Building',
      latitude: null,
      longitude: null,
    })

    expect(createBuildingMock).toHaveBeenCalledWith({
      name: 'Test Building',
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
})
