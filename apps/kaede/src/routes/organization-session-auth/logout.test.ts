import { OpenAPIHono } from '@hono/zod-openapi'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }))

vi.mock('../../usecases/organization-session-auth/index.js', () => ({
  logoutFromOrganization: logoutMock,
}))

import { organizationSessionAuthRoutes } from './index.js'

const organizationId = '11111111-1111-4111-8111-111111111111'
const membershipId = '22222222-2222-4222-8222-222222222222'

const createTestApp = () => {
  const app = new OpenAPIHono()
  app.route('/api/organizations', organizationSessionAuthRoutes)
  return app
}

describe('organization session logout route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('対象Grantだけをrevokeし、Session cookieを削除しない', async () => {
    logoutMock.mockResolvedValue({
      ok: true,
      value: { organization_id: organizationId, membership_id: membershipId, revoked: true },
    })

    const response = await createTestApp().request(
      `/api/organizations/${organizationId}/auth/logout`,
      {
        method: 'POST',
        headers: {
          cookie: 'okarin_session=session-token',
          'user-agent': 'logout-test',
          'x-request-id': 'request-id',
        },
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      organization_id: organizationId,
      membership_id: membershipId,
      revoked: true,
    })
    expect(logoutMock).toHaveBeenCalledWith(organizationId, 'session-token', {
      requestId: 'request-id',
      userAgent: 'logout-test',
    })
  })

  it('Sessionなしは401を返す', async () => {
    logoutMock.mockResolvedValue({ ok: false, error: { type: 'AUTH_UNAUTHENTICATED' } })

    const response = await createTestApp().request(
      `/api/organizations/${organizationId}/auth/logout`,
      { method: 'POST' }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error_code: 'AUTH_UNAUTHENTICATED',
    })
  })

  it('対象Organizationに所属していない場合は403を返す', async () => {
    logoutMock.mockResolvedValue({
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    })

    const response = await createTestApp().request(
      `/api/organizations/${organizationId}/auth/logout`,
      { method: 'POST', headers: { cookie: 'okarin_session=session-token' } }
    )

    expect(response.status).toBe(403)
  })
})
