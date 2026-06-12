import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationUserRoute } from './create-organization-user.js'

const { createOrganizationUserForSessionMock } = vi.hoisted(() => ({
  createOrganizationUserForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations.js', () => ({
  createOrganizationUserForSession: createOrganizationUserForSessionMock,
}))

describe('POST /api/organizations/:organizationId/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization user を作成して返す', async () => {
    createOrganizationUserForSessionMock.mockResolvedValue({
      ok: true,
      value: {
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
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationUserRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          email: 'member@example.com',
          display_name: 'Member A',
          role: 'member',
          temporary_password: 'initial-password',
          create_pedestrian: false,
        }),
      }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
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
    })
    expect(createOrganizationUserForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      {
        email: 'member@example.com',
        display_name: 'Member A',
        role: 'member',
        temporary_password: 'initial-password',
        create_pedestrian: false,
      }
    )
  })

  it('admin 以外が manager 作成を拒否された場合 403 を返す', async () => {
    createOrganizationUserForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationUserRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          email: 'manager@example.com',
          display_name: 'Manager A',
          role: 'manager',
          temporary_password: 'initial-password',
          create_pedestrian: false,
        }),
      }
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_FORBIDDEN',
      error_message: 'permission denied',
    })
  })

  it('既存 email の場合は 409 を返す', async () => {
    createOrganizationUserForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'USER_ALREADY_EXISTS',
      },
    })

    const app = createRouteTestApp('/organizations', registerCreateOrganizationUserRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          email: 'member@example.com',
          display_name: 'Member A',
          role: 'member',
          temporary_password: 'initial-password',
          create_pedestrian: false,
        }),
      }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'USER_ALREADY_EXISTS',
      error_message: 'user already exists',
    })
  })

  it('create_pedestrian=true で pedestrian がない場合は 400 を返し usecase を呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerCreateOrganizationUserRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          email: 'member@example.com',
          display_name: 'Member A',
          role: 'member',
          temporary_password: 'initial-password',
          create_pedestrian: true,
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(createOrganizationUserForSessionMock).not.toHaveBeenCalled()
  })
})
