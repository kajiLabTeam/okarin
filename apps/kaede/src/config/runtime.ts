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
  requestTimeoutMs: number
}

export interface StorageRuntimeConfig {
  accessKeyId: string
  bucket: string
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
  storage: StorageRuntimeConfig
}

const defaultPort = 8080
const defaultCallbackTokenTtlSeconds = 24 * 60 * 60
const defaultNozomiRequestTimeoutMs = 10 * 1000
const defaultRecordingUploadUrlTtlSeconds = 15 * 60
const defaultTrajectoryPresignTtlSeconds = 24 * 60 * 60

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
    requestTimeoutMs: parsePositiveIntegerEnv(
      'NOZOMI_REQUEST_TIMEOUT_MS',
      defaultNozomiRequestTimeoutMs
    ),
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
