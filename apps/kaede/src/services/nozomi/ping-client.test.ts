import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../config/runtime.js'
import { pingNozomi } from './ping-client.js'

describe('pingNozomi', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.NOZOMI_INTERNAL_ENDPOINT = 'http://nozomi:8000'
    process.env.NOZOMI_REQUEST_TIMEOUT_MS = '1000'
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    resetRuntimeConfigForTests()
  })

  it('nozomi の /rikka/ping を呼び出す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          rikka_version: '0.1.0',
          ping_module: 'rikka.api',
          checked_modules: ['rikka', 'rikka.api'],
          result: 'pong',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    globalThis.fetch = fetchMock as typeof fetch

    await expect(pingNozomi()).resolves.toEqual({
      ok: true,
      rikka_version: '0.1.0',
      ping_module: 'rikka.api',
      checked_modules: ['rikka', 'rikka.api'],
      result: 'pong',
    })
    expect(fetchMock).toHaveBeenCalledWith('http://nozomi:8000/rikka/ping', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    })
  })

  it('nozomi が非 200 を返したら失敗にする', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: 'ping failed',
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    globalThis.fetch = fetchMock as typeof fetch

    await expect(pingNozomi()).rejects.toThrow('nozomi ping request failed with status 500')
  })
})
