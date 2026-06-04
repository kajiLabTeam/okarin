import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { apiSharedTokenAuth } from './api-shared-token.js'

const createTestApp = (token?: string) => {
  const app = new Hono()

  app.use(
    '/api/*',
    apiSharedTokenAuth({
      exemptPaths: ['/api/trajectories/callback'],
      token,
    })
  )
  app.get('/api/ping', (c) => c.json({ ok: true }))
  app.post('/api/trajectories/callback', (c) => c.json({ ok: true }))
  app.get('/', (c) => c.json({ ok: true }))

  return app
}

describe('apiSharedTokenAuth', () => {
  it('token が設定されていなければ API リクエストを通す', async () => {
    const app = createTestApp()

    const response = await app.request('/api/ping')

    expect(response.status).toBe(200)
  })

  it('正しい Bearer token があれば API リクエストを通す', async () => {
    const app = createTestApp('shared-token')

    const response = await app.request('/api/ping', {
      headers: {
        authorization: 'Bearer shared-token',
      },
    })

    expect(response.status).toBe(200)
  })

  it('Bearer token がなければ 401 を返す', async () => {
    const app = createTestApp('shared-token')

    const response = await app.request('/api/ping')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UNAUTHORIZED',
      error_message: 'invalid or missing API token',
    })
  })

  it('不正な Bearer token は 401 を返す', async () => {
    const app = createTestApp('shared-token')

    const response = await app.request('/api/ping', {
      headers: {
        authorization: 'Bearer wrong-token',
      },
    })

    expect(response.status).toBe(401)
  })

  it('callback endpoint は shared token なしで通す', async () => {
    const app = createTestApp('shared-token')

    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
    })

    expect(response.status).toBe(200)
  })
})
