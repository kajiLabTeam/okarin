import { OpenAPIHono } from '@hono/zod-openapi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../config/runtime.js'

const { localLoginMock } = vi.hoisted(() => ({ localLoginMock: vi.fn() }))

vi.mock('../../usecases/organization-local-auth/index.js', () => ({
  loginToOrganizationWithLocalCredential: localLoginMock,
}))

import { organizationLocalAuthRoutes } from './index.js'

const createTestApp = () => {
  const app = new OpenAPIHono()
  app.route('/api/organizations', organizationLocalAuthRoutes)
  return app
}

describe('organization local auth route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_ENV = 'local'
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    Reflect.deleteProperty(process.env, 'APP_ENV')
    resetRuntimeConfigForTests()
  })

  it('新しいSessionのcookieとMembership Grantを返す', async () => {
    localLoginMock.mockResolvedValue({
      ok: true,
      value: {
        sessionToken: 'new-session-token',
        session: {
          id: '11111111-1111-4111-8111-111111111111',
          expires_at: '2026-08-18T10:00:00.000Z',
        },
        membership: {
          id: '22222222-2222-4222-8222-222222222222',
          organization_id: '33333333-3333-4333-8333-333333333333',
          role: 'member',
          status: 'active',
        },
        grant: {
          auth_method: 'local',
          authenticated_at: '2026-08-11T10:00:00.000Z',
          expires_at: '2026-08-11T18:00:00.000Z',
        },
        return_to: '/orgs/organization-a',
      },
    })

    const response = await createTestApp().request(
      '/api/organizations/organization-a/auth/local/login',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'local-auth-test',
          'x-request-id': 'request-id',
        },
        body: JSON.stringify({
          login_email: 'local@example.test',
          password: 'password',
          return_to: '/orgs/organization-a',
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('okarin_session=new-session-token')
    await expect(response.json()).resolves.toEqual({
      session: { expires_at: '2026-08-18T10:00:00.000Z' },
      membership: {
        id: '22222222-2222-4222-8222-222222222222',
        organization_id: '33333333-3333-4333-8333-333333333333',
        role: 'member',
        status: 'active',
      },
      grant: {
        auth_method: 'local',
        authenticated_at: '2026-08-11T10:00:00.000Z',
        expires_at: '2026-08-11T18:00:00.000Z',
      },
      return_to: '/orgs/organization-a',
    })
    expect(localLoginMock).toHaveBeenCalledWith(
      'organization-a',
      undefined,
      {
        login_email: 'local@example.test',
        password: 'password',
        return_to: '/orgs/organization-a',
      },
      { requestId: 'request-id', userAgent: 'local-auth-test' }
    )
  })

  it('reauthenticateでは既存Session cookieを渡し、新しいcookieを発行しない', async () => {
    localLoginMock.mockResolvedValue({
      ok: true,
      value: {
        session: {
          id: '11111111-1111-4111-8111-111111111111',
          expires_at: '2026-08-18T10:00:00.000Z',
        },
        membership: {
          id: '22222222-2222-4222-8222-222222222222',
          organization_id: '33333333-3333-4333-8333-333333333333',
          role: 'member',
          status: 'active',
        },
        grant: {
          auth_method: 'local',
          authenticated_at: '2026-08-11T10:00:00.000Z',
          expires_at: '2026-08-11T18:00:00.000Z',
        },
        return_to: '/orgs/organization-a',
      },
    })

    const response = await createTestApp().request(
      '/api/organizations/organization-a/auth/local/login',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=existing-session-token',
        },
        body: JSON.stringify({
          login_email: 'local@example.test',
          password: 'password',
          return_to: '/orgs/organization-a',
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(localLoginMock).toHaveBeenCalledWith(
      'organization-a',
      'existing-session-token',
      expect.any(Object),
      expect.any(Object)
    )
  })

  it.each([
    ['AUTH_INVALID_CREDENTIALS', 401],
    ['AUTH_METHOD_NOT_ALLOWED', 403],
    ['AUTH_IDENTITY_USER_MISMATCH', 403],
    ['AUTH_CREDENTIAL_LOCKED', 429],
  ])('%sをHTTP %iで返す', async (type, expectedStatus) => {
    localLoginMock.mockResolvedValue({ ok: false, error: { type } })

    const response = await createTestApp().request(
      '/api/organizations/organization-a/auth/local/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          login_email: 'local@example.test',
          password: 'password',
          return_to: '/orgs/organization-a',
        }),
      }
    )

    expect(response.status).toBe(expectedStatus)
    await expect(response.json()).resolves.toMatchObject({ error_code: type })
  })

  it('外部URL形式のreturn_toを拒否する', async () => {
    const response = await createTestApp().request(
      '/api/organizations/organization-a/auth/local/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          login_email: 'local@example.test',
          password: 'password',
          return_to: '//attacker.example.test',
        }),
      }
    )

    expect(response.status).toBe(400)
    expect(localLoginMock).not.toHaveBeenCalled()
  })
})
