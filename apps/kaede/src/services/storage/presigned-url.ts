import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { UploadTarget } from '../../schemas/common.js'
import { getS3Context } from './s3-client.js'

export interface RecordingUploadUrls {
  acce?: string
  gyro?: string
  metadata?: string
  pressure?: string
  wifi?: string
}

export interface RecordingRawDownloadUrls {
  acce: string
  gyro: string
  pressure?: string
  wifi?: string
}

export type FloorMapImageExtension = 'png' | 'svg'

const floorMapContentTypes: Record<FloorMapImageExtension, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
}

export const buildFloorMapObjectKey = (
  buildingId: string,
  floorId: string,
  extension: FloorMapImageExtension
) => {
  return `maps/${buildingId}/${floorId}.${extension}`
}

export const buildRecordingRawObjectKey = (
  organizationId: string,
  recordingId: string,
  target: UploadTarget
) => {
  if (target === 'metadata') {
    return `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
  }

  return `organizations/${organizationId}/recordings/${recordingId}/raw/${target}.csv`
}

export const buildRecordingRawObjectPrefix = (organizationId: string, recordingId: string) => {
  return `organizations/${organizationId}/recordings/${recordingId}/raw/`
}

export const buildTrajectoryAnalyzedResultObjectKey = (trajectoryId: string) => {
  return `trajectories/${trajectoryId}/analyzed/result.csv`
}

export const issueRecordingUploadUrls = async (
  organizationId: string,
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
          Key: buildRecordingRawObjectKey(organizationId, recordingId, target),
        }),
        { expiresIn: config.recordingUploadUrlTtlSeconds }
      )
    })
  )

  return {
    expiresAt: new Date(now.getTime() + config.recordingUploadUrlTtlSeconds * 1000).toISOString(),
    uploadUrls,
  }
}

export const issueFloorMapUploadUrl = async (
  objectKey: string,
  extension: FloorMapImageExtension,
  now: Date = new Date()
) => {
  const { config, presignClient } = getS3Context()
  const url = await getSignedUrl(
    presignClient,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: floorMapContentTypes[extension],
    }),
    {
      expiresIn: config.floorMapUploadUrlTtlSeconds,
      signableHeaders: new Set(['content-type']),
    }
  )

  return {
    expiresAt: new Date(now.getTime() + config.floorMapUploadUrlTtlSeconds * 1000).toISOString(),
    url,
  }
}

export const issueFloorMapDownloadUrl = async (objectKey: string, now: Date = new Date()) => {
  const { config, presignClient } = getS3Context()
  const url = await getSignedUrl(
    presignClient,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
    { expiresIn: config.floorMapDownloadUrlTtlSeconds }
  )

  return {
    expiresAt: new Date(now.getTime() + config.floorMapDownloadUrlTtlSeconds * 1000).toISOString(),
    url,
  }
}
export const issueInternalRecordingRawDownloadUrls = async (
  organizationId: string,
  recordingId: string,
  targets: UploadTarget[],
  now: Date = new Date()
) => {
  const { config, internalClient } = getS3Context()

  if (!targets.includes('acce') || !targets.includes('gyro')) {
    throw new Error('recording raw download URLs require acce and gyro targets')
  }

  const [acceUrl, gyroUrl] = await Promise.all([
    getSignedUrl(
      internalClient,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: buildRecordingRawObjectKey(organizationId, recordingId, 'acce'),
      }),
      { expiresIn: config.trajectoryRawDownloadUrlTtlSeconds }
    ),
    getSignedUrl(
      internalClient,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: buildRecordingRawObjectKey(organizationId, recordingId, 'gyro'),
      }),
      { expiresIn: config.trajectoryRawDownloadUrlTtlSeconds }
    ),
  ])

  const rawDataUrls: RecordingRawDownloadUrls = {
    acce: acceUrl,
    gyro: gyroUrl,
  }

  if (targets.includes('pressure')) {
    rawDataUrls.pressure = await getSignedUrl(
      internalClient,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: buildRecordingRawObjectKey(organizationId, recordingId, 'pressure'),
      }),
      { expiresIn: config.trajectoryRawDownloadUrlTtlSeconds }
    )
  }

  if (targets.includes('wifi')) {
    rawDataUrls.wifi = await getSignedUrl(
      internalClient,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: buildRecordingRawObjectKey(organizationId, recordingId, 'wifi'),
      }),
      { expiresIn: config.trajectoryRawDownloadUrlTtlSeconds }
    )
  }

  return {
    expiresAt: new Date(
      now.getTime() + config.trajectoryRawDownloadUrlTtlSeconds * 1000
    ).toISOString(),
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
    { expiresIn: config.trajectoryResultUploadUrlTtlSeconds }
  )

  return {
    expiresAt: new Date(
      now.getTime() + config.trajectoryResultUploadUrlTtlSeconds * 1000
    ).toISOString(),
    uploadUrl,
    objectKey,
  }
}
