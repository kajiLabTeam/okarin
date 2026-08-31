import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import {
  buildAnalysisHeatmapObjectKey,
  buildAnalysisTrajectoryCsvObjectKey,
  buildRecordingRawObjectKey,
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

export const getFloorMapObjectBytes = async (
  objectKey: string
): Promise<Uint8Array | undefined> => {
  const { config, internalClient } = getS3Context()
  try {
    const response = await internalClient.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey })
    )
    return response.Body ? await response.Body.transformToByteArray() : new Uint8Array()
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

export const validateBleCsvObject = async (organizationId: string, recordingId: string) => {
  const { config, internalClient } = getS3Context()
  const key = buildRecordingRawObjectKey(organizationId, recordingId, 'ble')
  const head = await internalClient.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
  if (head.ContentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/csv') return false
  if ((head.ContentLength ?? 0) > 100 * 1024 * 1024) return false
  const response = await internalClient.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
  if (!response.Body) return false
  const deadline = Date.now() + 30_000
  const decoder = new TextDecoder('utf-8', { fatal: true }); let pending = ''; let lineCount = 0; let previousEventSeq = -1
  const consume = (line: string) => {
    const value = line.endsWith('\r') ? line.slice(0, -1) : line
    if (new TextEncoder().encode(value).byteLength > 512) return false
    if (lineCount === 0) { lineCount++; return value === 'event_seq,timestamp_ns,wall_time_ms,beacon_id,ibeacon_uuid,major,minor,rssi_dbm,raw_data_hex' }
    if (!value) return true
    const columns = value.split(','); if (columns.length !== 9) return false
    const eventSeq = Number(columns[0]); const timestamp = Number(columns[1]); const wallTime = Number(columns[2]); const major = Number(columns[5]); const minor = Number(columns[6]); const rssi = Number(columns[7])
    if (![eventSeq, timestamp, wallTime, major, minor, rssi].every(Number.isInteger)) return false
    if (eventSeq <= previousEventSeq || timestamp <= 0 || wallTime <= 0 || major < 0 || major > 65535 || minor < 0 || minor > 65535 || rssi < -127 || rssi > 126) return false
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    if (!uuidPattern.test(columns[3] ?? '') || !uuidPattern.test(columns[4] ?? '')) return false
    if (!/^[0-9a-f]{46}$/.test(columns[8] ?? '')) return false
    previousEventSeq = eventSeq; lineCount++; return lineCount <= 5_000_001
  }
  let totalBytes = 0
  try {
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      if (Date.now() > deadline) return false
      totalBytes += chunk.byteLength
      if (totalBytes > 100 * 1024 * 1024) return false
      pending += decoder.decode(chunk, { stream: true }); const lines = pending.split('\n'); pending = lines.pop() ?? ''
      for (const line of lines) if (!consume(line)) return false
    }
    pending += decoder.decode(); if (pending && !consume(pending)) return false
    return lineCount > 0
  } catch {
    return false
  }
}

export const validateMetadataObject = async (organizationId: string, recordingId: string) => {
  const { config, internalClient } = getS3Context()
  const key = buildRecordingRawObjectKey(organizationId, recordingId, 'metadata')
  const head = await internalClient.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
  if (head.ContentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return false
  if ((head.ContentLength ?? 0) > 1024 * 1024) return false
  const response = await internalClient.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
  if (!response.Body) return false
  const deadline = Date.now() + 30_000; const decoder = new TextDecoder('utf-8', { fatal: true }); let text = ''; let totalBytes = 0
  try {
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      if (Date.now() > deadline) return false
      totalBytes += chunk.byteLength
      if (totalBytes > 1024 * 1024) return false
      text += decoder.decode(chunk, { stream: true })
    }
    const value = JSON.parse(text + decoder.decode())
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  } catch {
    return false
  }
}

export const doesTrajectoryAnalyzedResultObjectExist = async (
  organizationId: string,
  trajectoryId: string
) => {
  const expectedKey = buildTrajectoryAnalyzedResultObjectKey(organizationId, trajectoryId)
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
  organizationId: string,
  trajectoryId: string
): Promise<string | undefined> => {
  const expectedKey = buildTrajectoryAnalyzedResultObjectKey(organizationId, trajectoryId)
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

const doesObjectExist = async (objectKey: string) => {
  const { config, internalClient } = getS3Context()
  try {
    await internalClient.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
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

export const doesAnalysisTrajectoryCsvObjectExist = (
  organizationId: string,
  analysisRunId: string,
  trajectoryId: string
) =>
  doesObjectExist(buildAnalysisTrajectoryCsvObjectKey(organizationId, analysisRunId, trajectoryId))

export const getAnalysisHeatmapObjectText = async (
  organizationId: string,
  analysisRunId: string
): Promise<string | undefined> => {
  const objectKey = buildAnalysisHeatmapObjectKey(organizationId, analysisRunId)
  const { config, internalClient } = getS3Context()

  try {
    const response = await internalClient.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey })
    )
    return response.Body ? await response.Body.transformToString() : ''
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
