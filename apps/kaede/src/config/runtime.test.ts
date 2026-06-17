import { afterEach, describe, expect, it } from 'vitest'
import { getAppRuntimeConfig, getOidcRuntimeConfig, resetRuntimeConfigForTests } from './runtime.js'

const originalAppEnv = process.env.APP_ENV
const originalSharedToken = process.env.KAEDE_API_SHARED_TOKEN
const originalOidcEnabled = process.env.OIDC_ENABLED
const originalGoogleClientId = process.env.OIDC_GOOGLE_CLIENT_ID
const originalGoogleClientSecret = process.env.OIDC_GOOGLE_CLIENT_SECRET
const originalGoogleRedirectUri = process.env.OIDC_GOOGLE_REDIRECT_URI
const originalLoginSuccessRedirectUrl = process.env.OIDC_LOGIN_SUCCESS_REDIRECT_URL
const originalLoginFailureRedirectUrl = process.env.OIDC_LOGIN_FAILURE_REDIRECT_URL
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

  restoreOptionalEnv('OIDC_ENABLED', originalOidcEnabled)
  restoreOptionalEnv('OIDC_GOOGLE_CLIENT_ID', originalGoogleClientId)
  restoreOptionalEnv('OIDC_GOOGLE_CLIENT_SECRET', originalGoogleClientSecret)
  restoreOptionalEnv('OIDC_GOOGLE_REDIRECT_URI', originalGoogleRedirectUri)
  restoreOptionalEnv('OIDC_LOGIN_SUCCESS_REDIRECT_URL', originalLoginSuccessRedirectUrl)
  restoreOptionalEnv('OIDC_LOGIN_FAILURE_REDIRECT_URL', originalLoginFailureRedirectUrl)
  restoreOptionalEnv('OIDC_STATE_COOKIE_SECRET', originalStateCookieSecret)
  restoreOptionalEnv('PASSWORD_LOGIN_ENABLED', originalPasswordLoginEnabled)
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
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      env: 'local',
    })
  })

  it('test では shared token 未設定を許可する', () => {
    process.env.APP_ENV = 'test'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      env: 'test',
    })
  })

  it('local/test 以外では shared token 未設定を拒否する', () => {
    process.env.APP_ENV = 'staging'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(() => getAppRuntimeConfig()).toThrow(
      'KAEDE_API_SHARED_TOKEN is required outside local/test environments'
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
    process.env.OIDC_LOGIN_SUCCESS_REDIRECT_URL = 'https://app.example.test/'
    process.env.OIDC_LOGIN_FAILURE_REDIRECT_URL = 'https://app.example.test/login'
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
