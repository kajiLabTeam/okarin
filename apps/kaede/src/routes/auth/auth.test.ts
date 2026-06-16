import { OpenAPIHono } from '@hono/zod-openapi'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authRoutes } from './index.js'

const { changePasswordMock, getMeMock, loginMock, logoutMock } = vi.hoisted(() => ({
  changePasswordMock: vi.fn(),
  getMeMock: vi.fn(),
  loginMock: vi.fn(),
  logoutMock: vi.fn(),
}))

vi.mock('../../usecases/auth/index.js', () => ({
  authErrorStatus: (error: { type: string }) => {
    switch (error.type) {
      case 'AUTH_TEMPORARY_PASSWORD_EXPIRED':
      case 'AUTH_USER_DISABLED':
        return 403
      default:
        return 401
    }
  },
  changePassword: changePasswordMock,
  getMe: getMeMock,
  login: loginMock,
  logout: logoutMock,
}))

const createAuthTestApp = () => {
  const app = new OpenAPIHono()
  app.route('/api/auth', authRoutes)
  return app
}

const userResponse = {
  user: {
    user_id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    display_name: 'User',
    global_role: 'none',
    account_state: 'active',
    password_must_change: true,
    password_changed_at: null,
    temporary_password_expires_at: '2026-06-11T00:00:00.000Z',
    memberships: [
      {
        organization_id: '22222222-2222-4222-8222-222222222222',
        organization_name: 'Group A',
        role: 'member',
      },
    ],
  },
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /api/auth/login は session cookie を発行して user を返す', async () => {
    loginMock.mockResolvedValue({
      ok: true,
      value: {
        ...userResponse,
        sessionToken: 'session-token',
      },
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'temporary-password',
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('okarin_session=session-token')
    await expect(response.json()).resolves.toEqual(userResponse)
    expect(loginMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'temporary-password',
    })
  })

  it('POST /api/auth/login は認証失敗時 401 を返す', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_INVALID_CREDENTIALS',
      },
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_INVALID_CREDENTIALS',
      error_message: 'invalid email or password',
    })
  })

  it('GET /api/auth/me は cookie の session token で user を返す', async () => {
    getMeMock.mockResolvedValue({
      ok: true,
      value: userResponse,
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/me', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(userResponse)
    expect(getMeMock).toHaveBeenCalledWith('session-token')
  })

  it('GET /api/auth/me は未ログイン時 401 を返す', async () => {
    getMeMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/me')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
    expect(getMeMock).toHaveBeenCalledWith(undefined)
  })

  it('POST /api/auth/logout は session を revoke して cookie を削除する', async () => {
    logoutMock.mockResolvedValue({ ok: true })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('okarin_session=')
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(logoutMock).toHaveBeenCalledWith('session-token')
  })

  it('POST /api/auth/change-password は password を変更する', async () => {
    changePasswordMock.mockResolvedValue({
      ok: true,
      value: {
        ok: true,
      },
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        current_password: 'temporary-password',
        new_password: 'new-password',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(changePasswordMock).toHaveBeenCalledWith('session-token', {
      current_password: 'temporary-password',
      new_password: 'new-password',
    })
  })

  it('POST /api/auth/change-password は temporary password 期限切れ時 403 を返す', async () => {
    changePasswordMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_TEMPORARY_PASSWORD_EXPIRED',
      },
    })

    const app = createAuthTestApp()
    const response = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        current_password: 'temporary-password',
        new_password: 'new-password',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_TEMPORARY_PASSWORD_EXPIRED',
      error_message: 'temporary password expired',
    })
  })

  describe('input validation', () => {
    it('POST /api/auth/login は長すぎる email で 400 を返す', async () => {
      const app = createAuthTestApp()
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'a'.repeat(245) + '@example.com', // 256 chars
          password: 'password',
        }),
      })

      expect(response.status).toBe(400)
    })

    it('POST /api/auth/login は長すぎる password で 400 を返す', async () => {
      const app = createAuthTestApp()
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'a'.repeat(101),
        }),
      })

      expect(response.status).toBe(400)
    })

    it('POST /api/auth/change-password は長すぎる new_password で 400 を返す', async () => {
      const app = createAuthTestApp()
      const response = await app.request('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          current_password: 'old-password',
          new_password: 'a'.repeat(101),
        }),
      })

      expect(response.status).toBe(400)
    })
  })
})
