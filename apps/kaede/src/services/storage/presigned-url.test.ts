import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageRuntimeConfig } from '../../config/runtime.js'
import {
  buildRecordingRawObjectKey,
  issueRecordingUploadUrls,
  resetS3ClientForTests,
} from './index.js'

const { getStorageRuntimeConfigMock } = vi.hoisted(() => ({
  getStorageRuntimeConfigMock: vi.fn<() => StorageRuntimeConfig>(),
}))

vi.mock('../../config/runtime.js', () => ({
  getStorageRuntimeConfig: getStorageRuntimeConfigMock,
  resetRuntimeConfigForTests: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  resetS3ClientForTests()
})

describe('storage presigned url service', () => {
  it('recording raw object key を保存規約どおりに組み立てる', () => {
    expect(buildRecordingRawObjectKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gyro')).toBe(
      'recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/raw/gyro.csv'
    )
  })

  it('PUT 用の署名付き URL を生成できる', async () => {
    getStorageRuntimeConfigMock.mockReturnValue({
      accessKeyId: 'kaede-test',
      secretAccessKey: 'kaede-secret',
      internalEndpoint: 'http://seaweedfs:8333',
      publicEndpoint: 'http://127.0.0.1:8333',
      region: 'us-east-1',
      bucket: 'okarin-local',
    })

    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const now = new Date('2026-05-13T00:00:00.000Z')

    const result = await issueRecordingUploadUrls(recordingId, ['acce', 'gyro'], now)

    expect(result.expiresAt).toBe('2026-05-13T00:15:00.000Z')
    expect(result.uploadUrls.pressure).toBeUndefined()
    expect(result.uploadUrls.acce).toBeDefined()
    expect(result.uploadUrls.gyro).toBeDefined()
    if (!result.uploadUrls.acce || !result.uploadUrls.gyro) {
      throw new Error('expected upload URLs for acce and gyro')
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
