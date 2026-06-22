import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActorHonoEnv } from './request-actor.js'
import { getRequestActor, requestActorMiddleware } from './request-actor.js'

const { findUserByIdMock, findValidSessionByTokenMock, listUserOrganizationMembershipsMock } =
  vi.hoisted(() => ({
    findUserByIdMock: vi.fn(),
    findValidSessionByTokenMock: vi.fn(),
    listUserOrganizationMembershipsMock: vi.fn(),
  }))

vi.mock('../services/auth/index.js', () => ({
  findValidSessionByToken: findValidSessionByTokenMock,
}))

vi.mock('../services/users/index.js', () => ({
  findUserById: findUserByIdMock,
  listUserOrganizationMemberships: listUserOrganizationMembershipsMock,
}))

const createTestApp = (sharedToken = 'shared-token') => {
  const app = new Hono<RequestActorHonoEnv>()

  app.use(
    '/api/*',
    requestActorMiddleware({
      exemptPaths: ['/api/auth', '/api/trajectories/callback'],
      sharedToken,
    })
  )
  app.get('/api/ping', (c) => c.json({ actor: getRequestActor(c) }))
  app.get('/api/auth/me', (c) => c.json({ ok: true, actor: getRequestActor(c) ?? null }))
  app.post('/api/trajectories/callback', (c) =>
    c.json({ ok: true, actor: getRequestActor(c) ?? null })
  )

  return app
}

const mockActiveSessionUser = ({
  authMethod = 'password',
  passwordMustChange = false,
}: {
  authMethod?: 'password' | 'oidc'
  passwordMustChange?: boolean
} = {}) => {
  findValidSessionByTokenMock.mockResolvedValue({
    ok: true,
    session: {
      auth_method: authMethod,
      user_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  findUserByIdMock.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    global_role: 'none',
    is_active: true,
    password_must_change: passwordMustChange,
  })
  listUserOrganizationMembershipsMock.mockResolvedValue([
    {
      organization_id: '22222222-2222-4222-8222-222222222222',
      organization_name: 'Group A',
      role: 'member',
    },
  ])
}

describe('requestActorMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正しい shared token があれば service client actor を設定する', async () => {
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        authorization: 'Bearer shared-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      actor: {
        type: 'service_client',
        name: 'shared_token',
      },
    })
    expect(findValidSessionByTokenMock).not.toHaveBeenCalled()
  })

  it('Bearer scheme の大小文字と余分な空白を許容する', async () => {
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        authorization: '  bearer    shared-token  ',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      actor: {
        type: 'service_client',
        name: 'shared_token',
      },
    })
    expect(findValidSessionByTokenMock).not.toHaveBeenCalled()
  })

  it('不正な Bearer token は session cookie fallback せず拒否する', async () => {
    mockActiveSessionUser()
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        authorization: 'Bearer wrong-token',
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UNAUTHORIZED',
      error_message: 'invalid or missing API token',
    })
    expect(findValidSessionByTokenMock).not.toHaveBeenCalled()
  })

  it('Bearer token がなく session cookie が有効なら user actor を設定する', async () => {
    mockActiveSessionUser()
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      actor: {
        type: 'user',
        user_id: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com',
        global_role: 'none',
        account_state: 'active',
        password_must_change: false,
        memberships: [
          {
            organization_id: '22222222-2222-4222-8222-222222222222',
            organization_name: 'Group A',
            role: 'member',
          },
        ],
      },
    })
    expect(findValidSessionByTokenMock).toHaveBeenCalledWith('session-token')
  })

  it('shared token も session cookie もない場合は AUTH_UNAUTHENTICATED を返す', async () => {
    const app = createTestApp()

    const response = await app.request('/api/ping')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('password session の password_must_change user は非 auth API を拒否される', async () => {
    mockActiveSessionUser({ passwordMustChange: true })
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_PASSWORD_CHANGE_REQUIRED',
      error_message: 'password change required',
    })
  })

  it('oidc session の password_must_change user は非 auth API を利用できる', async () => {
    mockActiveSessionUser({ authMethod: 'oidc', passwordMustChange: true })
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.actor.password_must_change).toBe(true)
  })

  it('membership がない user は pending_membership actor として設定する', async () => {
    mockActiveSessionUser()
    listUserOrganizationMembershipsMock.mockResolvedValue([])
    const app = createTestApp()

    const response = await app.request('/api/ping', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.actor.account_state).toBe('pending_membership')
    expect(body.actor.memberships).toEqual([])
  })

  it('auth endpoint は actor middleware の対象外にする', async () => {
    mockActiveSessionUser({ passwordMustChange: true })
    const app = createTestApp()

    const response = await app.request('/api/auth/me', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      actor: null,
    })
    expect(findValidSessionByTokenMock).not.toHaveBeenCalled()
  })

  it('callback endpoint は actor middleware の対象外にする', async () => {
    const app = createTestApp()

    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      actor: null,
    })
  })
})
