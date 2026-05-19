import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import {
  buildRecordingRawObjectPrefix,
  buildTrajectoryAnalyzedResultObjectKey,
} from './presigned-url.js'
import { getS3Context } from './s3-client.js'

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
