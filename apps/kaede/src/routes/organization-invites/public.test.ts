import { OpenAPIHono } from '@hono/zod-openapi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../config/runtime.js'

const usecases = vi.hoisted(() => ({
  acceptOrganizationInviteWithLocalCredential: vi.fn(),
  verifyOrganizationInvite: vi.fn(),
}))
vi.mock('../../usecases/organization-invites/index.js', () => usecases)

import { organizationInvitesRoutes } from './index.js'

const app = () => {
  const instance = new OpenAPIHono()
  instance.route('/api/invites', organizationInvitesRoutes)
  return instance
}

describe('public organization invite routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_ENV = 'local'
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    Reflect.deleteProperty(process.env, 'APP_ENV')
    resetRuntimeConfigForTests()
  })

  it('verifyはInvite情報をno-storeで返す', async () => {
    usecases.verifyOrganizationInvite.mockResolvedValue({
      ok: true,
      value: {
        organization: { name: 'Example' },
        role: 'member',
        expires_at: '2026-08-18T10:00:00.000Z',
        authentication_methods: { local: true, oidc: true },
      },
    })
    const response = await app().request('/api/invites/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({ role: 'member' })
  })

  it('新規Local受領ではSession cookieを発行しtokenをresponse bodyへ含めない', async () => {
    usecases.acceptOrganizationInviteWithLocalCredential.mockResolvedValue({
      ok: true,
      value: {
        sessionToken: 'new-session-token',
        session: { expires_at: '2026-08-18T10:00:00.000Z' },
        membership: {
          id: '22222222-2222-4222-8222-222222222222',
          organization_id: '11111111-1111-4111-8111-111111111111',
          role: 'member',
          status: 'active',
        },
        grant: {
          auth_method: 'local',
          authenticated_at: '2026-08-11T10:00:00.000Z',
          expires_at: '2026-08-11T11:00:00.000Z',
        },
      },
    })
    const response = await app().request('/api/invites/auth/local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'plain-token',
        login_email: 'member@example.test',
        password: 'password',
        contact_email: 'contact@example.test',
        profile: { display_name: 'Member', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
      }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('okarin_session=new-session-token')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(await response.json())).not.toContain('new-session-token')
  })

  it.each([
    ['INVITE_INVALID', 404],
    ['INVITE_ALREADY_REDEEMED', 409],
    ['INVITE_EXPIRED', 422],
  ])('verifyの%sをHTTP %iで返す', async (type, status) => {
    usecases.verifyOrganizationInvite.mockResolvedValue({ ok: false, error: { type } })
    const response = await app().request('/api/invites/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token' }),
    })
    expect(response.status).toBe(status)
  })

  it.each([
    ['locale', { display_name: 'Member', locale: 'not_a_locale', timezone: 'Asia/Tokyo' }],
    ['timezone', { display_name: 'Member', locale: 'ja-JP', timezone: 'Mars/Olympus' }],
  ])('無効な%sをUseCaseへ渡さない', async (_field, profile) => {
    const response = await app().request('/api/invites/auth/local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'plain-token',
        login_email: ' member@example.test ',
        password: 'password',
        contact_email: ' contact@example.test ',
        profile,
      }),
    })

    expect(response.status).toBe(400)
    expect(usecases.acceptOrganizationInviteWithLocalCredential).not.toHaveBeenCalled()
  })
})
