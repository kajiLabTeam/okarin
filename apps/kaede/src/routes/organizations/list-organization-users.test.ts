import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationUsersRoute } from './list-organization-users.js'

const { listOrganizationUsersForSessionMock } = vi.hoisted(() => ({
  listOrganizationUsersForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations.js', () => ({
  listOrganizationUsersForSession: listOrganizationUsersForSessionMock,
}))

describe('GET /api/organizations/:organizationId/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization user 一覧を返す', async () => {
    listOrganizationUsersForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        users: [
          {
            user_id: '22222222-2222-4222-8222-222222222222',
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
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationUsersRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          user_id: '22222222-2222-4222-8222-222222222222',
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
        },
      ],
    })
    expect(listOrganizationUsersForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    listOrganizationUsersForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationUsersRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users'
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization がない場合は 404 を返す', async () => {
    listOrganizationUsersForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationUsersRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users'
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
    })
  })
})
