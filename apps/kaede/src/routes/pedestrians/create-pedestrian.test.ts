import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreatePedestrianRoute } from './create-pedestrian.js'

const serviceClientActor = {
  type: 'service_client',
  name: 'shared_token',
} as const

const { createPedestrianMock } = vi.hoisted(() => ({
  createPedestrianMock: vi.fn(),
}))

vi.mock('../../usecases/create-pedestrian.js', () => ({
  createPedestrian: createPedestrianMock,
}))

describe('POST /api/pedestrians', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pedestrian を作成して返す', async () => {
    createPedestrianMock.mockResolvedValue({
      ok: true,
      value: {
        pedestrian_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
        height: 1.72,
        stride_length: 0.7,
        attributes: {
          label: 'test participant',
        },
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
        height: 1.72,
        stride_length: 0.7,
        attributes: {
          label: 'test participant',
        },
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      display_name: 'test participant',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        label: 'test participant',
      },
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z',
    })

    expect(createPedestrianMock).toHaveBeenCalledWith(serviceClientActor, {
      organization_id: '99999999-9999-4999-8999-999999999999',
      display_name: 'test participant',
      height: 1.72,
      stride_length: 0.7,
      attributes: {
        label: 'test participant',
      },
    })
  })

  it('display_name だけで pedestrian を作成できる', async () => {
    createPedestrianMock.mockResolvedValue({
      ok: true,
      value: {
        pedestrian_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'minimal participant',
        height: null,
        stride_length: null,
        attributes: {},
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'minimal participant',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      display_name: 'minimal participant',
      height: null,
      stride_length: null,
      attributes: {},
    })

    expect(createPedestrianMock).toHaveBeenCalledWith(serviceClientActor, {
      organization_id: '99999999-9999-4999-8999-999999999999',
      display_name: 'minimal participant',
    })
  })

  it('存在しない organization_id は 404 を返す', async () => {
    createPedestrianMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
        organizationId: '99999999-9999-4999-8999-999999999999',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
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
    createPedestrianMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })

  it('organization 権限がない場合は 403 を返す', async () => {
    createPedestrianMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_ORGANIZATION_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_ORGANIZATION_FORBIDDEN',
      error_message: 'organization access forbidden',
    })
  })

  it('負の height はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute)
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
        display_name: 'test participant',
        height: -1,
      }),
    })

    expect(response.status).toBe(400)
    expect(createPedestrianMock).not.toHaveBeenCalled()
  })

  it('organization_id がない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute)
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        display_name: 'test participant',
      }),
    })

    expect(response.status).toBe(400)
    expect(createPedestrianMock).not.toHaveBeenCalled()
  })

  it('organization_id が UUID 形式でない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute)
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: 'invalid-organization-id',
        display_name: 'test participant',
      }),
    })

    expect(response.status).toBe(400)
    expect(createPedestrianMock).not.toHaveBeenCalled()
  })

  it('display_name がない場合はバリデーションエラーを返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/pedestrians', registerCreatePedestrianRoute)
    const response = await app.request('/api/pedestrians', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: '99999999-9999-4999-8999-999999999999',
      }),
    })

    expect(response.status).toBe(400)
    expect(createPedestrianMock).not.toHaveBeenCalled()
  })
})
