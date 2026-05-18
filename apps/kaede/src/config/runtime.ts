import { getOptionalEnv, getRequiredEnv, normalizeBaseUrl, parsePositiveIntegerEnv } from './env.js'

export interface AppRuntimeConfig {
  env: string
  deployRef: string
  deployedAt: string
  host: string
  port: number
  revision: string
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
}

export interface StorageRuntimeConfig {
  accessKeyId: string
  bucket: string
  internalEndpoint: string
  publicEndpoint: string
  region: string
  secretAccessKey: string
}

export interface RuntimeConfig {
  app: AppRuntimeConfig
  callback: CallbackRuntimeConfig
  database: DatabaseRuntimeConfig
  nozomi: NozomiRuntimeConfig
  storage: StorageRuntimeConfig
}

const defaultPort = 8080
const defaultCallbackTokenTtlSeconds = 24 * 60 * 60

let appRuntimeConfig: AppRuntimeConfig | undefined
let callbackRuntimeConfig: CallbackRuntimeConfig | undefined
let databaseRuntimeConfig: DatabaseRuntimeConfig | undefined
let nozomiRuntimeConfig: NozomiRuntimeConfig | undefined
let storageRuntimeConfig: StorageRuntimeConfig | undefined

export const getAppRuntimeConfig = (): AppRuntimeConfig => {
  appRuntimeConfig ??= {
    env: getOptionalEnv('APP_ENV', 'local'),
    deployRef: getOptionalEnv('APP_DEPLOY_REF', 'unknown'),
    deployedAt: getOptionalEnv('APP_DEPLOYED_AT', 'unknown'),
    host: getOptionalEnv('HOST', '0.0.0.0'),
    port: parsePositiveIntegerEnv('PORT', defaultPort),
    revision: getOptionalEnv('APP_REVISION', 'unknown'),
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
  }

  return nozomiRuntimeConfig
}

export const getStorageRuntimeConfig = (): StorageRuntimeConfig => {
  if (storageRuntimeConfig) {
    return storageRuntimeConfig
  }

  const internalEndpoint = normalizeBaseUrl(getRequiredEnv('S3_INTERNAL_ENDPOINT'))

  storageRuntimeConfig = {
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    bucket: getRequiredEnv('S3_BUCKET'),
    internalEndpoint,
    publicEndpoint: normalizeBaseUrl(process.env.S3_PUBLIC_ENDPOINT ?? internalEndpoint),
    region: getRequiredEnv('S3_REGION'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
  }

  return storageRuntimeConfig
}

export const getRuntimeConfig = (): RuntimeConfig => ({
  app: getAppRuntimeConfig(),
  callback: getCallbackRuntimeConfig(),
  database: getDatabaseRuntimeConfig(),
  nozomi: getNozomiRuntimeConfig(),
  storage: getStorageRuntimeConfig(),
})

export const validateRuntimeConfig = () => getRuntimeConfig()

export const resetRuntimeConfigForTests = () => {
  appRuntimeConfig = undefined
  callbackRuntimeConfig = undefined
  databaseRuntimeConfig = undefined
  nozomiRuntimeConfig = undefined
  storageRuntimeConfig = undefined
}
