import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetOrganizationUserRoute } from './get-organization-user.js'

const { getOrganizationUserForSessionMock } = vi.hoisted(() => ({
  getOrganizationUserForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  getOrganizationUserForSession: getOrganizationUserForSessionMock,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const userResponse = {
  user_id: userId,
  email: 'member@example.com',
  display_name: 'Member A',
  is_active: true,
  role: 'member',
  password_must_change: true,
  password_changed_at: null,
  temporary_password_expires_at: '2026-06-12T00:00:00.000Z',
  created_at: '2026-06-11T00:00:00.000Z',
  updated_at: '2026-06-11T00:00:00.000Z',
  pedestrian: null,
}

describe('GET /api/organizations/:organizationId/users/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization user 詳細を返す', async () => {
    getOrganizationUserForSessionMock.mockResolvedValue({
      ok: true,
      value: userResponse,
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationUserRoute)
    const response = await app.request(`/api/organizations/${organizationId}/users/${userId}`, {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(userResponse)
    expect(getOrganizationUserForSessionMock).toHaveBeenCalledWith(
      'session-token',
      organizationId,
      userId
    )
  })

  it('未ログイン時 401 を返す', async () => {
    getOrganizationUserForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationUserRoute)
    const response = await app.request(`/api/organizations/${organizationId}/users/${userId}`)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization user がない場合は 404 を返す', async () => {
    getOrganizationUserForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'USER_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationUserRoute)
    const response = await app.request(`/api/organizations/${organizationId}/users/${userId}`, {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'USER_NOT_FOUND',
      error_message: 'user not found',
    })
  })
})
