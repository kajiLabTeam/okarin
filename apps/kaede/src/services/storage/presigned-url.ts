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
  region: string
  secretAccessKey: string
}

let s3Client: S3Client | undefined

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

const getStorageConfig = (): StorageConfig => {
  return {
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    bucket: getRequiredEnv('S3_BUCKET'),
    endpoint: getRequiredEnv('S3_ENDPOINT'),
    region: getRequiredEnv('S3_REGION'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
  }
}

const getS3Client = () => {
  if (s3Client) {
    return s3Client
  }

  const config = getStorageConfig()
  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })

  return s3Client
}

export const buildRecordingRawObjectKey = (recordingId: string, target: UploadTarget) => {
  return `recordings/${recordingId}/raw/${target}.csv`
}

export const issueRecordingUploadUrls = async (
  recordingId: string,
  targets: UploadTarget[],
  now: Date = new Date()
) => {
  const client = getS3Client()
  const { bucket } = getStorageConfig()
  const uploadUrls: RecordingUploadUrls = {}

  await Promise.all(
    targets.map(async (target) => {
      uploadUrls[target] = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
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
}
