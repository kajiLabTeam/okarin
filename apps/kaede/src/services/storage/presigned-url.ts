import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { UploadTarget } from '../../schemas/common.js'

const uploadUrlTtlSeconds = 15 * 60

export interface RecordingUploadUrls {
  acce?: string
  gyro?: string
  pressure?: string
  wifi?: string
}

interface StorageConfig {
  accessKeyId: string
  bucket: string
  endpoint: string
  publicEndpoint: string
  region: string
  secretAccessKey: string
}

interface S3Context {
  client: S3Client
  config: StorageConfig
}

let s3Client: S3Client | undefined
let storageConfig: StorageConfig | undefined

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

const getStorageConfig = (): StorageConfig => {
  if (storageConfig) {
    return storageConfig
  }

  const endpoint = getRequiredEnv('S3_INTERNAL_ENDPOINT')

  storageConfig = {
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    bucket: getRequiredEnv('S3_BUCKET'),
    endpoint,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? endpoint,
    region: getRequiredEnv('S3_REGION'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
  }

  return storageConfig
}

const getS3Context = (): S3Context => {
  const config = getStorageConfig()

  if (s3Client) {
    return {
      client: s3Client,
      config,
    }
  }

  s3Client = new S3Client({
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
    client: s3Client,
    config,
  }
}

export const buildRecordingRawObjectKey = (recordingId: string, target: UploadTarget) => {
  return `recordings/${recordingId}/raw/${target}.csv`
}

export const issueRecordingUploadUrls = async (
  recordingId: string,
  targets: UploadTarget[],
  now: Date = new Date()
) => {
  const { client, config } = getS3Context()
  const uploadUrls: RecordingUploadUrls = {}

  await Promise.all(
    targets.map(async (target) => {
      uploadUrls[target] = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: buildRecordingRawObjectKey(recordingId, target),
        }),
        { expiresIn: uploadUrlTtlSeconds }
      )
    })
  )

  return {
    expiresAt: new Date(now.getTime() + uploadUrlTtlSeconds * 1000).toISOString(),
    uploadUrls,
  }
}

export const resetS3ClientForTests = () => {
  s3Client = undefined
  storageConfig = undefined
}
