import { S3Client } from '@aws-sdk/client-s3'
import { getStorageRuntimeConfig, resetRuntimeConfigForTests } from '../../config/runtime.js'

interface StorageConfig {
  accessKeyId: string
  bucket: string
  endpoint: string
  floorMapDownloadUrlTtlSeconds: number
  publicEndpoint: string
  region: string
  recordingUploadUrlTtlSeconds: number
  secretAccessKey: string
  trajectoryRawDownloadUrlTtlSeconds: number
  trajectoryResultUploadUrlTtlSeconds: number
}

export interface S3Context {
  config: StorageConfig
  internalClient: S3Client
  presignClient: S3Client
}

let internalS3Client: S3Client | undefined
let presignS3Client: S3Client | undefined
let storageConfig: StorageConfig | undefined

const getStorageConfig = (): StorageConfig => {
  if (storageConfig) {
    return storageConfig
  }

  const storage = getStorageRuntimeConfig()

  storageConfig = {
    accessKeyId: storage.accessKeyId,
    bucket: storage.bucket,
    endpoint: storage.internalEndpoint,
    floorMapDownloadUrlTtlSeconds: storage.floorMapDownloadUrlTtlSeconds,
    publicEndpoint: storage.publicEndpoint,
    region: storage.region,
    recordingUploadUrlTtlSeconds: storage.recordingUploadUrlTtlSeconds,
    secretAccessKey: storage.secretAccessKey,
    trajectoryRawDownloadUrlTtlSeconds: storage.trajectoryRawDownloadUrlTtlSeconds,
    trajectoryResultUploadUrlTtlSeconds: storage.trajectoryResultUploadUrlTtlSeconds,
  }

  return storageConfig
}

export const getS3Context = (): S3Context => {
  const config = getStorageConfig()

  if (internalS3Client && presignS3Client) {
    return {
      config,
      internalClient: internalS3Client,
      presignClient: presignS3Client,
    }
  }

  internalS3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })

  presignS3Client = new S3Client({
    region: config.region,
    endpoint: config.publicEndpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })

  return {
    config,
    internalClient: internalS3Client,
    presignClient: presignS3Client,
  }
}

export const resetS3ClientForTests = () => {
  internalS3Client = undefined
  presignS3Client = undefined
  storageConfig = undefined
  resetRuntimeConfigForTests()
}
