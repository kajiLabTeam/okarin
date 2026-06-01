import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateFloorRoute } from './create-floor.js'

const { createFloorMock } = vi.hoisted(() => ({
  createFloorMock: vi.fn(),
}))

vi.mock('../../usecases/create-floor.js', () => ({
  createFloor: createFloorMock,
}))

describe('POST /api/floors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('floor を作成して返す', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'

    createFloorMock.mockResolvedValue({
      ok: true,
      value: {
        floor_id: '22222222-2222-4222-8222-222222222222',
        building_id: buildingId,
        building_name: 'Test Building',
        level: 1,
        name: '1F',
        scale: 25,
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/floors', registerCreateFloorRoute)
    const response = await app.request('/api/floors', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        building_id: buildingId,
        level: 1,
        name: '1F',
        scale: 25,
        map_image_extension: 'png',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      floor_id: '22222222-2222-4222-8222-222222222222',
      building_id: buildingId,
      building_name: 'Test Building',
      level: 1,
      name: '1F',
      scale: 25,
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })

    expect(createFloorMock).toHaveBeenCalledWith({
      building_id: buildingId,
      level: 1,
      name: '1F',
      scale: 25,
      map_image_extension: 'png',
    })
  })

  it('存在しない building_id は 404 を返す', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'

    createFloorMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    })

    const app = createRouteTestApp('/floors', registerCreateFloorRoute)
    const response = await app.request('/api/floors', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        building_id: buildingId,
        level: 1,
        name: '1F',
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'BUILDING_NOT_FOUND',
      error_message: 'building_id does not exist',
      details: {
        building_id: buildingId,
      },
    })
  })

  it('不正な map_image_extension はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/floors', registerCreateFloorRoute)
    const response = await app.request('/api/floors', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        building_id: '11111111-1111-4111-8111-111111111111',
        level: 1,
        name: '1F',
        map_image_extension: 'jpg',
      }),
    })

    expect(response.status).toBe(400)
    expect(createFloorMock).not.toHaveBeenCalled()
  })
})
