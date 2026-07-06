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

interface OpenApiOperation {
  responses?: Record<string, unknown>
}

interface OpenApiDocument {
  openapi: string
  info: {
    title: string
    version: string
  }
  paths: Record<string, Record<string, OpenApiOperation> | undefined>
}

const createTestApp = async () => {
  const { createApp } = await import('./server.js')
  return createApp()
}

const getSpecification = async (): Promise<{
  response: Response
  document: OpenApiDocument
}> => {
  const app = await createTestApp()
  const response = await app.request('/specification')

  return {
    response,
    document: (await response.json()) as OpenApiDocument,
  }
}

const expectPathMethod = (document: OpenApiDocument, path: string, method: string) => {
  expect(document.paths[path]?.[method]).toBeDefined()
}

const expectJsonErrorResponse = (
  document: OpenApiDocument,
  path: string,
  method: string,
  status: string
) => {
  const operation = document.paths[path]?.[method]
  const response = operation?.responses?.[status] as
    | {
        content?: {
          'application/json'?: {
            schema?: unknown
          }
        }
      }
    | undefined

  expect(response?.content?.['application/json']?.schema).toBeDefined()
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

  it('/specification は shared token なしで OpenAPI document を返す', async () => {
    const { response, document } = await getSpecification()

    expect(response.status).toBe(200)
    expect(document.openapi).toBe('3.0.0')
    expect(document.info).toEqual({
      title: 'kaede API',
      version: '0.1.0',
    })
  })

  it('/specification に auth / organization / mobile app paths を含める', async () => {
    const { document } = await getSpecification()

    const expectedPaths = [
      ['/api/auth/login', 'post'],
      ['/api/auth/logout', 'post'],
      ['/api/auth/me', 'get'],
      ['/api/auth/change-password', 'post'],
      ['/api/auth/activation/verify', 'post'],
      ['/api/auth/activation/complete', 'post'],
      ['/api/actor/buildings', 'get'],
      ['/api/actor/floors', 'get'],
      ['/api/buildings/{buildingId}', 'get'],
      ['/api/floors/{floorId}', 'get'],
      ['/api/organizations', 'get'],
      ['/api/organizations', 'post'],
      ['/api/organizations/{organizationId}/buildings', 'get'],
      ['/api/organizations/{organizationId}/buildings', 'post'],
      ['/api/organizations/{organizationId}/buildings/{buildingId}/floors', 'get'],
      ['/api/organizations/{organizationId}/buildings/{buildingId}/floors', 'post'],
      ['/api/organizations/{organizationId}/floors', 'get'],
      ['/api/organizations/{organizationId}/recordings', 'get'],
      ['/api/organizations/{organizationId}/users', 'get'],
      ['/api/organizations/{organizationId}/users', 'post'],
      ['/api/organizations/{organizationId}/users/{userId}/activation-link', 'post'],
      ['/api/organizations/{organizationId}/memberships', 'post'],
      ['/api/pedestrians/me', 'get'],
      ['/api/pedestrians/me/recordings', 'get'],
      ['/api/recordings/{recordingId}', 'get'],
    ] as const

    for (const [path, method] of expectedPaths) {
      expectPathMethod(document, path, method)
    }
  })

  it('/specification に主要 route の auth / authorization error response を含める', async () => {
    const { document } = await getSpecification()

    const expectedErrorResponses = [
      ['/api/auth/login', 'post', '401'],
      ['/api/auth/login', 'post', '403'],
      ['/api/auth/me', 'get', '401'],
      ['/api/auth/me', 'get', '403'],
      ['/api/auth/change-password', 'post', '401'],
      ['/api/auth/change-password', 'post', '403'],
      ['/api/auth/activation/complete', 'post', '401'],
      ['/api/organizations', 'get', '401'],
      ['/api/organizations', 'get', '403'],
      ['/api/organizations', 'post', '401'],
      ['/api/organizations', 'post', '403'],
      ['/api/organizations/{organizationId}/buildings', 'get', '401'],
      ['/api/organizations/{organizationId}/buildings', 'get', '403'],
      ['/api/organizations/{organizationId}/buildings', 'post', '403'],
      ['/api/organizations/{organizationId}/buildings/{buildingId}/floors', 'get', '401'],
      ['/api/organizations/{organizationId}/buildings/{buildingId}/floors', 'get', '403'],
      ['/api/organizations/{organizationId}/buildings/{buildingId}/floors', 'post', '403'],
      ['/api/organizations/{organizationId}/floors', 'get', '401'],
      ['/api/organizations/{organizationId}/floors', 'get', '403'],
      ['/api/organizations/{organizationId}/recordings', 'get', '401'],
      ['/api/organizations/{organizationId}/recordings', 'get', '403'],
      ['/api/organizations/{organizationId}/users', 'get', '401'],
      ['/api/organizations/{organizationId}/users', 'get', '403'],
      ['/api/organizations/{organizationId}/users', 'post', '401'],
      ['/api/organizations/{organizationId}/users', 'post', '403'],
      ['/api/organizations/{organizationId}/users/{userId}/activation-link', 'post', '401'],
      ['/api/organizations/{organizationId}/users/{userId}/activation-link', 'post', '403'],
      ['/api/organizations/{organizationId}/users/{userId}/activation-link', 'post', '404'],
      ['/api/organizations/{organizationId}/users/{userId}/activation-link', 'post', '409'],
      ['/api/organizations/{organizationId}/memberships', 'post', '401'],
      ['/api/organizations/{organizationId}/memberships', 'post', '403'],
      ['/api/pedestrians/me', 'get', '403'],
      ['/api/pedestrians/me/recordings', 'get', '403'],
      ['/api/pedestrians', 'get', '403'],
      ['/api/pedestrians', 'post', '403'],
      ['/api/recordings/{recordingId}', 'get', '403'],
      ['/api/recordings/{recordingId}/trajectories', 'get', '403'],
      ['/api/recordings/init', 'post', '403'],
      ['/api/recordings/{recordingId}/complete-upload', 'post', '403'],
      ['/api/recordings/{recordingId}/refresh-upload-urls', 'post', '403'],
      ['/api/recordings/{recordingId}/trajectories', 'post', '403'],
      ['/api/trajectories/{trajectoryId}', 'get', '403'],
      ['/api/trajectories/{trajectoryId}/map-data', 'get', '400'],
      ['/api/trajectories/{trajectoryId}/map-data', 'get', '403'],
      ['/api/trajectories/{trajectoryId}/map-data', 'get', '404'],
      ['/api/trajectories/{trajectoryId}/map-data', 'get', '409'],
      ['/api/trajectories/{trajectoryId}/map-data', 'get', '422'],
      ['/api/trajectories/{trajectoryId}/result', 'get', '403'],
      ['/api/trajectories/{trajectoryId}/result', 'get', '404'],
      ['/api/trajectories/{trajectoryId}/result', 'get', '409'],
    ] as const

    for (const [path, method, status] of expectedErrorResponses) {
      expectJsonErrorResponse(document, path, method, status)
    }
  })
})
