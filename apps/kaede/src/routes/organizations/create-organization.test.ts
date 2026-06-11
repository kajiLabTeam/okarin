import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationRoute } from './create-organization.js'

const { createOrganizationForSessionMock } = vi.hoisted(() => ({
  createOrganizationForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations.js', () => ({
  createOrganizationForSession: createOrganizationForSessionMock,
}))

describe('POST /api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization を作成して返す', async () => {
    createOrganizationForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        organization_id: '11111111-1111-4111-8111-111111111111',
        name: 'Group A',
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationRoute)
    const response = await app.request('/api/organizations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        name: 'Group A',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      organization_id: '11111111-1111-4111-8111-111111111111',
      name: 'Group A',
      created_at: '2026-06-11T00:00:00.000Z',
      updated_at: '2026-06-11T00:00:00.000Z',
    })
    expect(createOrganizationForSessionMock).toHaveBeenCalledWith('session-token', {
      name: 'Group A',
    })
  })

  it('未ログイン時 401 を返す', async () => {
    createOrganizationForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationRoute)
    const response = await app.request('/api/organizations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Group A',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('admin 以外は 403 を返す', async () => {
    createOrganizationForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationRoute)
    const response = await app.request('/api/organizations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        name: 'Group A',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_FORBIDDEN',
      error_message: 'permission denied',
    })
  })

  it('name がない場合は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationRoute)
    const response = await app.request('/api/organizations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(createOrganizationForSessionMock).not.toHaveBeenCalled()
  })
})
