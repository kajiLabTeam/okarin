import {
  getOptionalEnv,
  getRequiredEnv,
  normalizeBaseUrl,
  parseBooleanEnv,
  parsePositiveIntegerEnv,
} from './env.js'

export interface AppRuntimeConfig {
  apiSharedToken?: string
  corsAllowedOrigins: string[]
  env: string
  frontendOrigin?: string
  deployRef: string
  deployedAt: string
  host: string
  port: number
  revision: string
  sessionCookieSameSite: 'Strict' | 'Lax' | 'None'
}

export interface CallbackRuntimeConfig {
  baseUrl: string
  tokenSecret: string
  tokenTtlSeconds: number
}

export interface DatabaseRuntimeConfig {
  url: string
}

export interface NozomiRuntimeConfig {
  internalEndpoint: string
  requestTimeoutMs: number
}

export interface OidcRuntimeConfig {
  enabled: boolean
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  loginSuccessRedirectUrl: string
  loginFailureRedirectUrl: string
  stateCookieSecret: string
  passwordLoginEnabled: boolean
  organizationCreationRequestsEnabled: boolean
}

export interface StorageRuntimeConfig {
  accessKeyId: string
  bucket: string
  floorMapDownloadUrlTtlSeconds: number
  internalEndpoint: string
  publicEndpoint: string
  region: string
  recordingUploadUrlTtlSeconds: number
  secretAccessKey: string
  trajectoryRawDownloadUrlTtlSeconds: number
  trajectoryResultUploadUrlTtlSeconds: number
}

export interface RuntimeConfig {
  app: AppRuntimeConfig
  callback: CallbackRuntimeConfig
  database: DatabaseRuntimeConfig
  nozomi: NozomiRuntimeConfig
  oidc: OidcRuntimeConfig
  storage: StorageRuntimeConfig
}

const defaultPort = 8080
const defaultCallbackTokenTtlSeconds = 24 * 60 * 60
const defaultNozomiRequestTimeoutMs = 10 * 1000
const defaultFloorMapDownloadUrlTtlSeconds = 60 * 60
const defaultRecordingUploadUrlTtlSeconds = 15 * 60
const defaultTrajectoryPresignTtlSeconds = 24 * 60 * 60

let appRuntimeConfig: AppRuntimeConfig | undefined
let callbackRuntimeConfig: CallbackRuntimeConfig | undefined
let databaseRuntimeConfig: DatabaseRuntimeConfig | undefined
let nozomiRuntimeConfig: NozomiRuntimeConfig | undefined
let oidcRuntimeConfig: OidcRuntimeConfig | undefined
let storageRuntimeConfig: StorageRuntimeConfig | undefined

const isSharedTokenOptionalEnv = (env: string) => env === 'local' || env === 'test'

const getFrontendOriginEnv = () => {
  const raw = process.env.FRONTEND_ORIGIN
  if (!raw) {
    return undefined
  }

  return normalizeBaseUrl(raw.trim())
}

const parseSessionCookieSameSiteEnv = (): AppRuntimeConfig['sessionCookieSameSite'] => {
  const raw = process.env.SESSION_COOKIE_SAME_SITE
  if (!raw) {
    return 'Lax'
  }

  switch (raw.trim().toLowerCase()) {
    case 'strict':
      return 'Strict'
    case 'lax':
      return 'Lax'
    case 'none':
      return 'None'
    default:
      throw new Error('SESSION_COOKIE_SAME_SITE must be one of Strict, Lax, None')
  }
}

export const getAppRuntimeConfig = (): AppRuntimeConfig => {
  if (appRuntimeConfig) {
    return appRuntimeConfig
  }

  const env = getOptionalEnv('APP_ENV', 'local')
  const apiSharedToken = process.env.KAEDE_API_SHARED_TOKEN
  const frontendOrigin = getFrontendOriginEnv()
  const sessionCookieSameSite = parseSessionCookieSameSiteEnv()

  if (!apiSharedToken && !isSharedTokenOptionalEnv(env)) {
    throw new Error('KAEDE_API_SHARED_TOKEN is required outside local/test environments')
  }

  if (sessionCookieSameSite === 'None' && env === 'local') {
    throw new Error(
      'SESSION_COOKIE_SAME_SITE=None requires Secure cookies outside local environment'
    )
  }

  appRuntimeConfig = {
    apiSharedToken,
    corsAllowedOrigins: frontendOrigin ? [frontendOrigin] : [],
    env,
    frontendOrigin,
    deployRef: getOptionalEnv('APP_DEPLOY_REF', 'unknown'),
    deployedAt: getOptionalEnv('APP_DEPLOYED_AT', 'unknown'),
    host: getOptionalEnv('HOST', '0.0.0.0'),
    port: parsePositiveIntegerEnv('PORT', defaultPort),
    revision: getOptionalEnv('APP_REVISION', 'unknown'),
    sessionCookieSameSite,
  }

  return appRuntimeConfig
}

export const getCallbackRuntimeConfig = (): CallbackRuntimeConfig => {
  callbackRuntimeConfig ??= {
    baseUrl: normalizeBaseUrl(getRequiredEnv('KAEDE_INTERNAL_BASE_URL')),
    tokenSecret: getRequiredEnv('CALLBACK_TOKEN_SECRET'),
    tokenTtlSeconds: parsePositiveIntegerEnv(
      'CALLBACK_TOKEN_TTL_SECONDS',
      defaultCallbackTokenTtlSeconds
    ),
  }

  return callbackRuntimeConfig
}

export const getDatabaseRuntimeConfig = (): DatabaseRuntimeConfig => {
  databaseRuntimeConfig ??= {
    url: getRequiredEnv('DATABASE_URL'),
  }

  return databaseRuntimeConfig
}

export const getNozomiRuntimeConfig = (): NozomiRuntimeConfig => {
  nozomiRuntimeConfig ??= {
    internalEndpoint: normalizeBaseUrl(getRequiredEnv('NOZOMI_INTERNAL_ENDPOINT')),
    requestTimeoutMs: parsePositiveIntegerEnv(
      'NOZOMI_REQUEST_TIMEOUT_MS',
      defaultNozomiRequestTimeoutMs
    ),
  }

  return nozomiRuntimeConfig
}

export const getOidcRuntimeConfig = (): OidcRuntimeConfig => {
  if (oidcRuntimeConfig) {
    return oidcRuntimeConfig
  }

  const enabled = parseBooleanEnv('OIDC_ENABLED', false)
  const passwordLoginEnabled = parseBooleanEnv('PASSWORD_LOGIN_ENABLED', true)
  const organizationCreationRequestsEnabled = parseBooleanEnv(
    'ORGANIZATION_CREATION_REQUESTS_ENABLED',
    true
  )
  const googleClientId = enabled ? getRequiredEnv('OIDC_GOOGLE_CLIENT_ID') : ''
  const googleClientSecret = enabled ? getRequiredEnv('OIDC_GOOGLE_CLIENT_SECRET') : ''
  const googleRedirectUri = enabled ? getRequiredEnv('OIDC_GOOGLE_REDIRECT_URI') : ''
  const frontendOrigin = enabled ? normalizeBaseUrl(getRequiredEnv('FRONTEND_ORIGIN')) : ''

  oidcRuntimeConfig = {
    enabled,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    loginSuccessRedirectUrl: enabled ? `${frontendOrigin}/` : '/',
    loginFailureRedirectUrl: enabled ? `${frontendOrigin}/login` : '/',
    stateCookieSecret: enabled ? getRequiredEnv('OIDC_STATE_COOKIE_SECRET') : '',
    passwordLoginEnabled,
    organizationCreationRequestsEnabled,
  }

  return oidcRuntimeConfig
}

export const getStorageRuntimeConfig = (): StorageRuntimeConfig => {
  if (storageRuntimeConfig) {
    return storageRuntimeConfig
  }

  const internalEndpoint = normalizeBaseUrl(getRequiredEnv('S3_INTERNAL_ENDPOINT'))

  storageRuntimeConfig = {
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    bucket: getRequiredEnv('S3_BUCKET'),
    floorMapDownloadUrlTtlSeconds: parsePositiveIntegerEnv(
      'S3_FLOOR_MAP_DOWNLOAD_URL_TTL_SECONDS',
      defaultFloorMapDownloadUrlTtlSeconds
    ),
    internalEndpoint,
    publicEndpoint: normalizeBaseUrl(process.env.S3_PUBLIC_ENDPOINT ?? internalEndpoint),
    region: getRequiredEnv('S3_REGION'),
    recordingUploadUrlTtlSeconds: parsePositiveIntegerEnv(
      'S3_RECORDING_UPLOAD_URL_TTL_SECONDS',
      defaultRecordingUploadUrlTtlSeconds
    ),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    trajectoryRawDownloadUrlTtlSeconds: parsePositiveIntegerEnv(
      'S3_TRAJECTORY_RAW_DOWNLOAD_URL_TTL_SECONDS',
      defaultTrajectoryPresignTtlSeconds
    ),
    trajectoryResultUploadUrlTtlSeconds: parsePositiveIntegerEnv(
      'S3_TRAJECTORY_RESULT_UPLOAD_URL_TTL_SECONDS',
      defaultTrajectoryPresignTtlSeconds
    ),
  }

  return storageRuntimeConfig
}

export const getRuntimeConfig = (): RuntimeConfig => ({
  app: getAppRuntimeConfig(),
  callback: getCallbackRuntimeConfig(),
  database: getDatabaseRuntimeConfig(),
  nozomi: getNozomiRuntimeConfig(),
  oidc: getOidcRuntimeConfig(),
  storage: getStorageRuntimeConfig(),
})

export const validateRuntimeConfig = () => getRuntimeConfig()

export const resetRuntimeConfigForTests = () => {
  appRuntimeConfig = undefined
  callbackRuntimeConfig = undefined
  databaseRuntimeConfig = undefined
  nozomiRuntimeConfig = undefined
  oidcRuntimeConfig = undefined
  storageRuntimeConfig = undefined
}
