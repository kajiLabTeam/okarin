import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from './config/runtime.js'

const envNames = [
  'APP_ENV',
  'CALLBACK_TOKEN_SECRET',
  'DATABASE_URL',
  'FRONTEND_ORIGIN',
  'KAEDE_API_SHARED_TOKEN',
  'KAEDE_INTERNAL_BASE_URL',
  'NOZOMI_INTERNAL_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_BUCKET',
  'S3_INTERNAL_ENDPOINT',
  'S3_REGION',
  'S3_SECRET_ACCESS_KEY',
  'SESSION_COOKIE_SAME_SITE',
] as const

const originalEnv = new Map<string, string | undefined>()

const createTestApp = async () => {
  const { createApp } = await import('./server.js')
  return createApp()
}

describe('createApp auth wiring', { timeout: 60_000 }, () => {
  beforeEach(() => {
    for (const name of envNames) {
      originalEnv.set(name, process.env[name])
    }

    process.env.APP_ENV = 'test'
    process.env.CALLBACK_TOKEN_SECRET = 'callback-secret'
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/okarin'
    Reflect.deleteProperty(process.env, 'FRONTEND_ORIGIN')
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    process.env.KAEDE_INTERNAL_BASE_URL = 'http://kaede:8080'
    process.env.NOZOMI_INTERNAL_ENDPOINT = 'http://nozomi:8000'
    process.env.S3_ACCESS_KEY_ID = 'kaede-test'
    process.env.S3_BUCKET = 'okarin-test'
    process.env.S3_INTERNAL_ENDPOINT = 'http://seaweedfs:8333'
    process.env.S3_REGION = 'ap-northeast-1'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    Reflect.deleteProperty(process.env, 'SESSION_COOKIE_SAME_SITE')
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

  it('/api/* は shared token も session cookie もなしなら 401 を返す', async () => {
    const app = await createTestApp()

    const response = await app.request('/api/nozomi/ping')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('/api/auth/* は shared token なしでも auth route まで到達する', async () => {
    const app = await createTestApp()

    const response = await app.request('/api/auth/me')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('OpenAPIでglobal session 401とmembership 403を別schemaとして公開する', async () => {
    const app = await createTestApp()

    const response = await app.request('/specification')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      paths: {
        '/api/auth/me': {
          get: {
            responses: {
              '401': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/GlobalSessionErrorResponse' },
                  },
                },
              },
              '403': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/UserAccountErrorResponse' },
                  },
                },
              },
            },
          },
        },
        '/api/organizations/{organizationSlug}/auth/methods': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/OrganizationAuthMethodsResponse' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          GlobalSessionErrorResponse: expect.any(Object),
          OrganizationAuthorizationErrorResponse: expect.objectContaining({
            oneOf: expect.arrayContaining([
              expect.objectContaining({
                properties: expect.objectContaining({
                  error_code: {
                    type: 'string',
                    enum: ['AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED'],
                  },
                }),
              }),
            ]),
          }),
        },
      },
    })
  })

  it('FRONTEND_ORIGIN があれば credential 付き CORS preflight を許可する', async () => {
    process.env.FRONTEND_ORIGIN = 'https://mio.example.test'
    resetRuntimeConfigForTests()
    const app = await createTestApp()

    const response = await app.request('/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://mio.example.test',
        'access-control-request-method': 'GET',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mio.example.test')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('health check は shared token なしで通す', async () => {
    const app = await createTestApp()

    const response = await app.request('/')

    expect(response.status).toBe(200)
  })

  it('/api/trajectories/callback は shared token なしでも callback route まで到達する', async () => {
    const app = await createTestApp()

    const response = await app.request('/api/trajectories/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trajectory_id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        callback_token: 'signed-token',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error_code: 'CALLBACK_PAYLOAD_INVALID',
    })
  })

  it('/api/analysis-runs/callback は session なしでも callback route まで到達する', async () => {
    const app = await createTestApp()

    const response = await app.request('/api/analysis-runs/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.not.toMatchObject({
      error_code: 'AUTH_UNAUTHENTICATED',
    })
  })
})
