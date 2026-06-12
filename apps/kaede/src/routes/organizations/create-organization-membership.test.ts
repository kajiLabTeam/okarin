import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationMembershipRoute } from './create-organization-membership.js'

const { createOrUpdateOrganizationMembershipForSessionMock } = vi.hoisted(() => ({
  createOrUpdateOrganizationMembershipForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations.js', () => ({
  createOrUpdateOrganizationMembershipForSession:
    createOrUpdateOrganizationMembershipForSessionMock,
}))

describe('POST /api/organizations/:organizationId/memberships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('membership を作成または更新して organization user を返す', async () => {
    createOrUpdateOrganizationMembershipForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        user_id: '22222222-2222-4222-8222-222222222222',
        email: 'member@example.com',
        display_name: 'Member A',
        is_active: true,
        role: 'manager',
        password_must_change: false,
        password_changed_at: '2026-06-11T00:00:00.000Z',
        temporary_password_expires_at: null,
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
        pedestrian: null,
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationMembershipRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/memberships',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          role: 'manager',
        }),
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      user_id: '22222222-2222-4222-8222-222222222222',
      email: 'member@example.com',
      display_name: 'Member A',
      is_active: true,
      role: 'manager',
      password_must_change: false,
      password_changed_at: '2026-06-11T00:00:00.000Z',
      temporary_password_expires_at: null,
      created_at: '2026-06-11T00:00:00.000Z',
      updated_at: '2026-06-11T00:00:00.000Z',
      pedestrian: null,
    })
    expect(createOrUpdateOrganizationMembershipForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      {
        user_id: '22222222-2222-4222-8222-222222222222',
        role: 'manager',
      }
    )
  })

  it('未ログイン時 401 を返す', async () => {
    createOrUpdateOrganizationMembershipForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationMembershipRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/memberships',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          role: 'member',
        }),
      }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('権限がない場合は 403 を返す', async () => {
    createOrUpdateOrganizationMembershipForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationMembershipRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/memberships',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          role: 'manager',
        }),
      }
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_FORBIDDEN',
      error_message: 'permission denied',
    })
  })

  it('user がない場合は 404 を返す', async () => {
    createOrUpdateOrganizationMembershipForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'USER_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationMembershipRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/memberships',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          role: 'member',
        }),
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'USER_NOT_FOUND',
      error_message: 'user not found',
    })
  })

  it('invalid body は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationMembershipRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/memberships',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          user_id: 'not-a-uuid',
          role: 'member',
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(createOrUpdateOrganizationMembershipForSessionMock).not.toHaveBeenCalled()
  })
})
