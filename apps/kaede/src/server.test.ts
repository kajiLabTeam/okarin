import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from './config/runtime.js'

const envNames = [
  'APP_ENV',
  'CALLBACK_TOKEN_SECRET',
  'DATABASE_URL',
  'KAEDE_API_SHARED_TOKEN',
  'KAEDE_INTERNAL_BASE_URL',
  'NOZOMI_INTERNAL_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_BUCKET',
  'S3_INTERNAL_ENDPOINT',
  'S3_REGION',
  'S3_SECRET_ACCESS_KEY',
] as const

const originalEnv = new Map<string, string | undefined>()

describe('createApp auth wiring', () => {
  beforeEach(() => {
    for (const name of envNames) {
      originalEnv.set(name, process.env[name])
    }

    process.env.APP_ENV = 'test'
    process.env.CALLBACK_TOKEN_SECRET = 'callback-secret'
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/okarin'
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    process.env.KAEDE_INTERNAL_BASE_URL = 'http://kaede:8080'
    process.env.NOZOMI_INTERNAL_ENDPOINT = 'http://nozomi:8000'
    process.env.S3_ACCESS_KEY_ID = 'kaede-test'
    process.env.S3_BUCKET = 'okarin-test'
    process.env.S3_INTERNAL_ENDPOINT = 'http://seaweedfs:8333'
    process.env.S3_REGION = 'ap-northeast-1'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    for (const name of envNames) {
      const value = originalEnv.get(name)
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name)
      } else {
        process.env[name] = value
      }
    }

    originalEnv.clear()
    resetRuntimeConfigForTests()
  })

  it('/api/* は shared token なしなら 401 を返す', async () => {
    const { createApp } = await import('./server.js')
    const app = createApp()

    const response = await app.request('/api/nozomi/ping')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UNAUTHORIZED',
      error_message: 'invalid or missing API token',
    })
  })

  it('health check は shared token なしで通す', async () => {
    const { createApp } = await import('./server.js')
    const app = createApp()

    const response = await app.request('/')

    expect(response.status).toBe(200)
  })
})
