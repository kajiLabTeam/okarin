import { afterEach, describe, expect, it } from 'vitest'
import {
  buildRecordingRawObjectKey,
  issueRecordingUploadUrls,
  resetS3ClientForTests,
} from './index.js'

const originalEnv = {
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
}

afterEach(() => {
  process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID
  process.env.S3_BUCKET = originalEnv.S3_BUCKET
  process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT
  process.env.S3_REGION = originalEnv.S3_REGION
  process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY
  resetS3ClientForTests()
})

describe('storage s3 service', () => {
  it('recording raw object key を保存規約どおりに組み立てる', () => {
    expect(buildRecordingRawObjectKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gyro')).toBe(
      'recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/raw/gyro.csv'
    )
  })

  it('PUT 用の署名付き URL を生成できる', async () => {
    process.env.S3_ACCESS_KEY_ID = 'kaede-test'
    process.env.S3_SECRET_ACCESS_KEY = 'kaede-secret'
    process.env.S3_ENDPOINT = 'http://127.0.0.1:8333'
    process.env.S3_REGION = 'us-east-1'
    process.env.S3_BUCKET = 'okarin-local'

    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const now = new Date('2026-05-13T00:00:00.000Z')

    const result = await issueRecordingUploadUrls(recordingId, ['acce', 'gyro'], now)

    expect(result.expiresAt).toBe('2026-05-13T00:15:00.000Z')
    expect(result.uploadUrls.pressure).toBeUndefined()
    expect(result.uploadUrls.acce).toBeDefined()
    expect(result.uploadUrls.gyro).toBeDefined()

    if (!result.uploadUrls.acce) {
      throw new Error('acce upload URL is missing')
    }

    if (!result.uploadUrls.gyro) {
      throw new Error('gyro upload URL is missing')
    }

    const acceUrl = new URL(result.uploadUrls.acce)
    const gyroUrl = new URL(result.uploadUrls.gyro)

    expect(acceUrl.origin).toBe('http://127.0.0.1:8333')
    expect(acceUrl.pathname).toBe(`/okarin-local/recordings/${recordingId}/raw/acce.csv`)
    expect(acceUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(acceUrl.searchParams.get('X-Amz-Credential')).toContain('kaede-test')
    expect(acceUrl.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(acceUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(acceUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]+$/)

    expect(gyroUrl.pathname).toBe(`/okarin-local/recordings/${recordingId}/raw/gyro.csv`)
  })
})
