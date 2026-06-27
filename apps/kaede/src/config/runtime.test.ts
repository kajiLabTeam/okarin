import { afterEach, describe, expect, it } from 'vitest'
import { getAppRuntimeConfig, getOidcRuntimeConfig, resetRuntimeConfigForTests } from './runtime.js'

const originalAppEnv = process.env.APP_ENV
const originalDashboardBaseUrl = process.env.DASHBOARD_BASE_URL
const originalFrontendOrigin = process.env.FRONTEND_ORIGIN
const originalSharedToken = process.env.KAEDE_API_SHARED_TOKEN
const originalSessionCookieSameSite = process.env.SESSION_COOKIE_SAME_SITE
const originalOidcEnabled = process.env.OIDC_ENABLED
const originalGoogleClientId = process.env.OIDC_GOOGLE_CLIENT_ID
const originalGoogleClientSecret = process.env.OIDC_GOOGLE_CLIENT_SECRET
const originalGoogleRedirectUri = process.env.OIDC_GOOGLE_REDIRECT_URI
const originalStateCookieSecret = process.env.OIDC_STATE_COOKIE_SECRET
const originalPasswordLoginEnabled = process.env.PASSWORD_LOGIN_ENABLED
const originalOrganizationCreationRequestsEnabled =
  process.env.ORGANIZATION_CREATION_REQUESTS_ENABLED

const restoreEnv = () => {
  if (originalAppEnv === undefined) {
    Reflect.deleteProperty(process.env, 'APP_ENV')
  } else {
    process.env.APP_ENV = originalAppEnv
  }

  if (originalDashboardBaseUrl === undefined) {
    Reflect.deleteProperty(process.env, 'DASHBOARD_BASE_URL')
  } else {
    process.env.DASHBOARD_BASE_URL = originalDashboardBaseUrl
  }

  if (originalSharedToken === undefined) {
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
  } else {
    process.env.KAEDE_API_SHARED_TOKEN = originalSharedToken
  }

  const restoreOptionalEnv = (name: string, value: string | undefined) => {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name)
    } else {
      process.env[name] = value
    }
  }

  restoreOptionalEnv('FRONTEND_ORIGIN', originalFrontendOrigin)
  restoreOptionalEnv('OIDC_ENABLED', originalOidcEnabled)
  restoreOptionalEnv('OIDC_GOOGLE_CLIENT_ID', originalGoogleClientId)
  restoreOptionalEnv('OIDC_GOOGLE_CLIENT_SECRET', originalGoogleClientSecret)
  restoreOptionalEnv('OIDC_GOOGLE_REDIRECT_URI', originalGoogleRedirectUri)
  restoreOptionalEnv('OIDC_STATE_COOKIE_SECRET', originalStateCookieSecret)
  restoreOptionalEnv('PASSWORD_LOGIN_ENABLED', originalPasswordLoginEnabled)
  restoreOptionalEnv('SESSION_COOKIE_SAME_SITE', originalSessionCookieSameSite)
  restoreOptionalEnv(
    'ORGANIZATION_CREATION_REQUESTS_ENABLED',
    originalOrganizationCreationRequestsEnabled
  )

  resetRuntimeConfigForTests()
}

describe('getAppRuntimeConfig', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('local では shared token 未設定を許可する', () => {
    process.env.APP_ENV = 'local'
    process.env.DASHBOARD_BASE_URL = 'http://dashboard.example.test'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      corsAllowedOrigins: [],
      env: 'local',
      frontendOrigin: undefined,
      sessionCookieSameSite: 'Lax',
    })
  })

  it('test では shared token 未設定を許可する', () => {
    process.env.APP_ENV = 'test'
    process.env.DASHBOARD_BASE_URL = 'http://dashboard.example.test'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      corsAllowedOrigins: [],
      env: 'test',
      frontendOrigin: undefined,
      sessionCookieSameSite: 'Lax',
    })
  })

  it('local/test 以外では shared token 未設定を拒否する', () => {
    process.env.APP_ENV = 'staging'
    process.env.DASHBOARD_BASE_URL = 'http://dashboard.example.test'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(() => getAppRuntimeConfig()).toThrow(
      'KAEDE_API_SHARED_TOKEN is required outside local/test environments'
    )
  })

  it('frontend origin から CORS allowed origin を導出し session cookie SameSite を読む', () => {
    process.env.APP_ENV = 'staging'
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    process.env.DASHBOARD_BASE_URL = 'http://dashboard.example.test'
    process.env.FRONTEND_ORIGIN = 'https://mio.example.test/'
    process.env.SESSION_COOKIE_SAME_SITE = 'None'
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      corsAllowedOrigins: ['https://mio.example.test'],
      frontendOrigin: 'https://mio.example.test',
      sessionCookieSameSite: 'None',
    })
  })

  it('local では session cookie SameSite=None を拒否する', () => {
    process.env.APP_ENV = 'local'
    process.env.DASHBOARD_BASE_URL = 'http://dashboard.example.test'
    process.env.SESSION_COOKIE_SAME_SITE = 'None'
    resetRuntimeConfigForTests()

    expect(() => getAppRuntimeConfig()).toThrow(
      'SESSION_COOKIE_SAME_SITE=None requires Secure cookies outside local environment'
    )
  })
})

describe('getOidcRuntimeConfig', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('OIDC_DISABLED では Google 設定なしで起動できる', () => {
    process.env.OIDC_ENABLED = 'false'
    Reflect.deleteProperty(process.env, 'OIDC_GOOGLE_CLIENT_ID')
    resetRuntimeConfigForTests()

    expect(getOidcRuntimeConfig()).toMatchObject({
      enabled: false,
      passwordLoginEnabled: true,
      organizationCreationRequestsEnabled: true,
    })
  })

  it('OIDC_ENABLED では Google 設定を要求する', () => {
    process.env.OIDC_ENABLED = 'true'
    Reflect.deleteProperty(process.env, 'OIDC_GOOGLE_CLIENT_ID')
    resetRuntimeConfigForTests()

    expect(() => getOidcRuntimeConfig()).toThrow('OIDC_GOOGLE_CLIENT_ID is not set')
  })

  it('OIDC 設定と feature flag を読む', () => {
    process.env.OIDC_ENABLED = 'true'
    process.env.OIDC_GOOGLE_CLIENT_ID = 'client-id'
    process.env.OIDC_GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.OIDC_GOOGLE_REDIRECT_URI = 'https://api.example.test/api/auth/oidc/google/callback'
    process.env.FRONTEND_ORIGIN = 'https://app.example.test'
    process.env.OIDC_STATE_COOKIE_SECRET = 'state-cookie-secret'
    process.env.PASSWORD_LOGIN_ENABLED = 'false'
    process.env.ORGANIZATION_CREATION_REQUESTS_ENABLED = 'false'
    resetRuntimeConfigForTests()

    expect(getOidcRuntimeConfig()).toEqual({
      enabled: true,
      googleClientId: 'client-id',
      googleClientSecret: 'client-secret',
      googleRedirectUri: 'https://api.example.test/api/auth/oidc/google/callback',
      loginSuccessRedirectUrl: 'https://app.example.test/',
      loginFailureRedirectUrl: 'https://app.example.test/login',
      stateCookieSecret: 'state-cookie-secret',
      passwordLoginEnabled: false,
      organizationCreationRequestsEnabled: false,
    })
  })
})
