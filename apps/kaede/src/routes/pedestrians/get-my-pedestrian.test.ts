import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetMyPedestrianRoute } from './get-my-pedestrian.js'

const userActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  password_must_change: false,
  memberships: [
    {
      organization_id: '99999999-9999-4999-8999-999999999999',
      organization_name: 'Test Organization',
      role: 'member',
    },
  ],
}

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const { getMyPedestrianMock } = vi.hoisted(() => ({
  getMyPedestrianMock: vi.fn(),
}))

vi.mock('../../usecases/pedestrians/get-my-pedestrian.js', () => ({
  getMyPedestrian: getMyPedestrianMock,
}))

describe('GET /api/pedestrians/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ログイン user に紐づく pedestrian を返す', async () => {
    getMyPedestrianMock.mockResolvedValue({
      ok: true,
      value: {
        pedestrian_id: '22222222-2222-4222-8222-222222222222',
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

    const app = createRouteTestApp('/pedestrians', registerGetMyPedestrianRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/pedestrians/me')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pedestrian_id: '22222222-2222-4222-8222-222222222222',
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
    expect(getMyPedestrianMock).toHaveBeenCalledWith(userActor)
  })

  it('紐づく pedestrian がない場合は 404 を返す', async () => {
    getMyPedestrianMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerGetMyPedestrianRoute, {
      actor: userActor,
    })
    const response = await app.request('/api/pedestrians/me')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PEDESTRIAN_NOT_FOUND',
      error_message: 'pedestrian not found',
    })
  })

  it('service client actor は 403 を返す', async () => {
    getMyPedestrianMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/pedestrians', registerGetMyPedestrianRoute, {
      actor: serviceClientActor,
    })
    const response = await app.request('/api/pedestrians/me')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
    expect(getMyPedestrianMock).toHaveBeenCalledWith(serviceClientActor)
  })
})
