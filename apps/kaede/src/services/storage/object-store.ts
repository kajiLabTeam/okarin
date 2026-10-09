import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
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

export const putBeaconLayoutObject = async (objectKey: string, body: Uint8Array) => {
  const { config, internalClient } = getS3Context()

  await internalClient.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'application/json',
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
  const response = await internalClient.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  )
  if (!response.Body) return false
  const deadline = Date.now() + 30_000
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  let lineCount = 0
  let previousEventSeq = -1
  const consume = (line: string) => {
    const value = line.endsWith('\r') ? line.slice(0, -1) : line
    if (new TextEncoder().encode(value).byteLength > 512) return false
    if (lineCount === 0) {
      lineCount++
      return (
        value ===
        'event_seq,timestamp_ns,wall_time_ms,beacon_id,ibeacon_uuid,major,minor,rssi_dbm,raw_data_hex'
      )
    }
    if (!value) return true
    const columns = value.split(',')
    if (columns.length !== 9) return false
    const eventSeq = Number(columns[0])
    const timestamp = Number(columns[1])
    const wallTime = Number(columns[2])
    const major = Number(columns[5])
    const minor = Number(columns[6])
    const rssi = Number(columns[7])
    if (![eventSeq, timestamp, wallTime, major, minor, rssi].every(Number.isInteger)) return false
    if (
      eventSeq <= previousEventSeq ||
      timestamp <= 0 ||
      wallTime <= 0 ||
      major < 0 ||
      major > 65535 ||
      minor < 0 ||
      minor > 65535 ||
      rssi < -127 ||
      rssi > 126
    )
      return false
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    if (!uuidPattern.test(columns[3] ?? '') || !uuidPattern.test(columns[4] ?? '')) return false
    if (!/^[0-9a-f]{46}$/.test(columns[8] ?? '')) return false
    previousEventSeq = eventSeq
    lineCount++
    return lineCount <= 5_000_001
  }
  let totalBytes = 0
  try {
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      if (Date.now() > deadline) return false
      totalBytes += chunk.byteLength
      if (totalBytes > 100 * 1024 * 1024) return false
      pending += decoder.decode(chunk, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (!consume(line)) return false
    }
    pending += decoder.decode()
    if (pending && !consume(pending)) return false
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
  const response = await internalClient.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  )
  if (!response.Body) return false
  const deadline = Date.now() + 30_000
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let totalBytes = 0
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

export interface DataAssetValidationResult {
  valid: boolean
  byteSize: number
  checksumSha256: string | null
  sampleCount?: number | null
  startedAt?: Date | null
  endedAt?: Date | null
}

export const validateDataAssetObject = async (
  objectKey: string,
  expectedContentType: string,
  definition?: {
    format: string
    required_columns: string[]
    timestamp_column?: string
    wall_time_column?: string
    column_types: Record<string, 'integer' | 'number' | 'string'>
  },
  maxBytes = 100 * 1024 * 1024
): Promise<DataAssetValidationResult> => {
  const { config, internalClient } = getS3Context()
  try {
    const head = await internalClient.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey })
    )
    const valid =
      (head.ContentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '') === expectedContentType &&
      (head.ContentLength ?? 0) > 0 &&
      (head.ContentLength ?? 0) <= maxBytes
    if (!valid) return { valid: false, byteSize: head.ContentLength ?? 0, checksumSha256: null }
    const response = await internalClient.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey })
    )
    if (!response.Body)
      return { valid: false, byteSize: head.ContentLength ?? 0, checksumSha256: null }
    if (definition?.format !== 'csv') {
      return { valid: false, byteSize: 0, checksumSha256: null }
    }
    const hash = createHash('sha256')
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let totalBytes = 0
    const deadline = Date.now() + 30_000
    let field = ''
    let record: string[] = []
    let quoted = 0
    let pendingQuote = 0
    let headers: string[] | undefined
    let indexes = new Map<string, number>()
    let previousTimestamp: number | undefined
    let startedAt: Date | null = null
    let endedAt: Date | null = null
    let sampleCount = 0
    let invalid = false
    const consumeRecord = (values: string[]) => {
      if (!headers) {
        headers = values.map((header, index) =>
          index === 0 ? header.replace(/^\uFEFF/, '') : header
        )
        indexes = new Map(headers.map((header, index) => [header, index]))
        invalid = definition.required_columns.some((column) => !indexes.has(column))
        return
      }
      if (values.length !== headers.length) {
        invalid = true
        return
      }
      sampleCount++
      for (const [column, type] of Object.entries(definition.column_types)) {
        const value = values[indexes.get(column) ?? -1] ?? ''
        if (value.length === 0) invalid = true
        if (type === 'integer' && !/^-?\d+$/.test(value)) invalid = true
        if (type === 'number' && !Number.isFinite(Number(value))) invalid = true
      }
      if (definition.timestamp_column) {
        const timestampColumn = definition.timestamp_column
        const timestamp = Number(values[indexes.get(timestampColumn) ?? -1])
        const timestampType = definition.column_types[timestampColumn]
        const timestampValid =
          timestampType === 'integer' ? Number.isSafeInteger(timestamp) : Number.isFinite(timestamp)
        if (!timestampValid || (previousTimestamp !== undefined && timestamp <= previousTimestamp))
          invalid = true
        previousTimestamp = timestamp
        if (definition.wall_time_column) {
          const wallTime = Number(values[indexes.get(definition.wall_time_column) ?? -1])
          if (!Number.isSafeInteger(wallTime) || wallTime <= 0) invalid = true
          const date = new Date(wallTime)
          if (Number.isNaN(date.getTime())) invalid = true
          startedAt ??= date
          endedAt = date
        }
      }
    }
    const consumeText = (text: string) => {
      for (const character of text) {
        if (pendingQuote === 1) {
          if (character === '"') {
            field += '"'
            pendingQuote = 0
            continue
          }
          quoted = 0
          pendingQuote = 0
        }
        if (character === '"' && quoted === 1) {
          pendingQuote = 1
          continue
        }
        if (character === '"') {
          quoted = quoted === 1 ? 0 : 1
          continue
        }
        if (character === ',' && quoted === 0) {
          record.push(field)
          field = ''
          continue
        }
        if ((character === '\n' || character === '\r') && quoted === 0) {
          if (character === '\r') continue
          record.push(field)
          field = ''
          consumeRecord(record)
          record = []
          continue
        }
        field += character
      }
    }
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      if (Date.now() > deadline) return { valid: false, byteSize: totalBytes, checksumSha256: null }
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) return { valid: false, byteSize: totalBytes, checksumSha256: null }
      hash.update(chunk)
      consumeText(decoder.decode(chunk, { stream: true }))
    }
    consumeText(decoder.decode())
    if (pendingQuote === 1) {
      // A quote immediately before EOF closes the field. Any still-open quoted
      // field without that closing quote is malformed.
      pendingQuote = 0
      quoted = 0
    } else if (quoted === 1) {
      invalid = true
    }
    if (field.length > 0 || record.length > 0) {
      record.push(field)
      consumeRecord(record)
    }
    const checksumSha256 = hash.digest('hex')
    if (invalid) return { valid: false, byteSize: totalBytes, checksumSha256 }
    if (sampleCount === 0) return { valid: false, byteSize: totalBytes, checksumSha256 }
    return { valid: true, byteSize: totalBytes, checksumSha256, sampleCount, startedAt, endedAt }
  } catch {
    return { valid: false, byteSize: 0, checksumSha256: null }
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
