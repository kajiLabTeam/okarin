import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerPingNozomiRoute } from './ping.js'

const { pingNozomiMock } = vi.hoisted(() => ({
  pingNozomiMock: vi.fn(),
}))

vi.mock('../../services/nozomi/index.js', async () => {
  const actual = await vi.importActual('../../services/nozomi/index.js')

  return {
    ...actual,
    pingNozomi: pingNozomiMock,
  }
})

describe('GET /api/nozomi/ping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('nozomi ping 成功時はその結果を返す', async () => {
    pingNozomiMock.mockResolvedValue({
      ok: true,
      rikka_version: '0.1.0',
      ping_module: 'rikka.api',
      checked_modules: ['rikka', 'rikka.api'],
      result: 'pong',
    })

    const app = createRouteTestApp('/nozomi', registerPingNozomiRoute)
    const response = await app.request('/api/nozomi/ping')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      rikka_version: '0.1.0',
      ping_module: 'rikka.api',
      checked_modules: ['rikka', 'rikka.api'],
      result: 'pong',
    })
    expect(pingNozomiMock).toHaveBeenCalledTimes(1)
  })

  it('nozomi ping 失敗時は 502 を返す', async () => {
    pingNozomiMock.mockRejectedValue(new Error('nozomi ping request failed with status 500'))

    const app = createRouteTestApp('/nozomi', registerPingNozomiRoute)
    const response = await app.request('/api/nozomi/ping')

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error_code: 'NOZOMI_PING_FAILED',
      error_message: 'failed to ping nozomi',
      details: {
        reason: 'nozomi ping request failed with status 500',
      },
    })
  })
})
