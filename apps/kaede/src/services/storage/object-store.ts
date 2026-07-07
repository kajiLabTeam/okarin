import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import {
  buildRecordingRawObjectPrefix,
  buildTrajectoryAnalyzedResultObjectKey,
  getFloorMapContentType,
} from './presigned-url.js'
import type { FloorMapImageExtension } from './presigned-url.js'
import { getS3Context } from './s3-client.js'

export const putFloorMapObject = async (
  objectKey: string,
  extension: FloorMapImageExtension,
  body: Uint8Array
) => {
  const { config, internalClient } = getS3Context()

  await internalClient.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: getFloorMapContentType(extension),
    })
  )
}

export const deleteFloorMapObject = async (objectKey: string) => {
  const { config, internalClient } = getS3Context()

  await internalClient.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    })
  )
}

export const listRecordingRawObjectKeys = async (organizationId: string, recordingId: string) => {
  const { config, internalClient } = getS3Context()
  const prefix = buildRecordingRawObjectPrefix(organizationId, recordingId)
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

export const doesTrajectoryAnalyzedResultObjectExist = async (trajectoryId: string) => {
  const expectedKey = buildTrajectoryAnalyzedResultObjectKey(trajectoryId)
  const { config, internalClient } = getS3Context()

  try {
    await internalClient.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: expectedKey,
      })
    )

    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error.name === 'NotFound' || error.name === 'NoSuchKey')
    ) {
      return false
    }

    throw error
  }
}

export const getTrajectoryAnalyzedResultObjectText = async (
  trajectoryId: string
): Promise<string | undefined> => {
  const expectedKey = buildTrajectoryAnalyzedResultObjectKey(trajectoryId)
  const { config, internalClient } = getS3Context()

  try {
    const response = await internalClient.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: expectedKey,
      })
    )

    if (!response.Body) {
      return ''
    }

    return await response.Body.transformToString()
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error.name === 'NotFound' || error.name === 'NoSuchKey')
    ) {
      return undefined
    }

    throw error
  }
}
