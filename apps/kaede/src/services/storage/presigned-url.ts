import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getStorageRuntimeConfig, resetRuntimeConfigForTests } from '../../config/runtime.js'
import type { UploadTarget } from '../../schemas/common.js'

const uploadUrlTtlSeconds = 15 * 60

export interface RecordingUploadUrls {
  acce?: string
  gyro?: string
  pressure?: string
  wifi?: string
}

export interface RecordingRawDownloadUrls {
  acce: string
  gyro: string
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
    publicEndpoint: storage.publicEndpoint,
    region: storage.region,
    secretAccessKey: storage.secretAccessKey,
  }

  return storageConfig
}

const getS3Context = (): S3Context => {
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

export const buildRecordingRawObjectKey = (recordingId: string, target: UploadTarget) => {
  return `recordings/${recordingId}/raw/${target}.csv`
}

export const buildRecordingRawObjectPrefix = (recordingId: string) => {
  return `recordings/${recordingId}/raw/`
}

export const buildTrajectoryAnalyzedResultObjectKey = (trajectoryId: string) => {
  return `trajectories/${trajectoryId}/analyzed/result.csv`
}

export const issueRecordingUploadUrls = async (
  recordingId: string,
  targets: UploadTarget[],
  now: Date = new Date()
) => {
  const { config, presignClient } = getS3Context()
  const uploadUrls: RecordingUploadUrls = {}

  await Promise.all(
    targets.map(async (target) => {
      uploadUrls[target] = await getSignedUrl(
        presignClient,
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

export const listRecordingRawObjectKeys = async (recordingId: string) => {
  const { config, internalClient } = getS3Context()
  const prefix = buildRecordingRawObjectPrefix(recordingId)
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await internalClient.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key)
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

export const issueInternalRecordingRawDownloadUrls = async (
  recordingId: string,
  targets: UploadTarget[],
  now: Date = new Date()
) => {
  const { config, internalClient } = getS3Context()
  const rawDataUrls = {} as RecordingRawDownloadUrls

  await Promise.all(
    targets.map(async (target) => {
      rawDataUrls[target] = await getSignedUrl(
        internalClient,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: buildRecordingRawObjectKey(recordingId, target),
        }),
        { expiresIn: uploadUrlTtlSeconds }
      )
    })
  )

  return {
    expiresAt: new Date(now.getTime() + uploadUrlTtlSeconds * 1000).toISOString(),
    rawDataUrls,
  }
}

export const issueInternalTrajectoryResultUploadUrl = async (
  trajectoryId: string,
  now: Date = new Date()
) => {
  const { config, internalClient } = getS3Context()
  const objectKey = buildTrajectoryAnalyzedResultObjectKey(trajectoryId)

  const uploadUrl = await getSignedUrl(
    internalClient,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
    { expiresIn: uploadUrlTtlSeconds }
  )

  return {
    expiresAt: new Date(now.getTime() + uploadUrlTtlSeconds * 1000).toISOString(),
    uploadUrl,
    objectKey,
  }
}

export const resetS3ClientForTests = () => {
  internalS3Client = undefined
  presignS3Client = undefined
  storageConfig = undefined
  resetRuntimeConfigForTests()
}
