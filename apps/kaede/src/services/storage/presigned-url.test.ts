import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageRuntimeConfig } from '../../config/runtime.js'
import {
  buildFloorMapObjectKey,
  buildRecordingRawObjectKey,
  getFloorMapContentType,
  getFloorMapExtensionFromObjectKey,
  issueFloorMapDownloadUrl,
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
    expect(
      buildRecordingRawObjectKey(
        '99999999-9999-4999-8999-999999999999',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'gyro'
      )
    ).toBe(
      'organizations/99999999-9999-4999-8999-999999999999/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/raw/gyro.csv'
    )
    expect(
      buildRecordingRawObjectKey(
        '99999999-9999-4999-8999-999999999999',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'metadata'
      )
    ).toBe(
      'organizations/99999999-9999-4999-8999-999999999999/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/raw/metadata.json'
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
      floorMapDownloadUrlTtlSeconds: 3600,
      recordingUploadUrlTtlSeconds: 900,
      trajectoryRawDownloadUrlTtlSeconds: 86400,
      trajectoryResultUploadUrlTtlSeconds: 86400,
    })

    const organizationId = '99999999-9999-4999-8999-999999999999'
    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const now = new Date('2026-05-13T00:00:00.000Z')

    const result = await issueRecordingUploadUrls(
      organizationId,
      recordingId,
      ['acce', 'gyro', 'metadata'],
      now
    )

    expect(result.expiresAt).toBe('2026-05-13T00:15:00.000Z')
    expect(result.uploadUrls.pressure).toBeUndefined()
    expect(result.uploadUrls.acce).toBeDefined()
    expect(result.uploadUrls.gyro).toBeDefined()
    expect(result.uploadUrls.metadata).toBeDefined()
    if (!result.uploadUrls.acce || !result.uploadUrls.gyro || !result.uploadUrls.metadata) {
      throw new Error('expected upload URLs for acce, gyro and metadata')
    }

    const acceUrl = new URL(result.uploadUrls.acce)
    const gyroUrl = new URL(result.uploadUrls.gyro)
    const metadataUrl = new URL(result.uploadUrls.metadata)

    expect(acceUrl.origin).toBe('http://127.0.0.1:8333')
    expect(acceUrl.pathname).toBe(
      `/okarin-local/organizations/${organizationId}/recordings/${recordingId}/raw/acce.csv`
    )
    expect(acceUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(acceUrl.searchParams.get('X-Amz-Credential')).toContain('kaede-test')
    expect(acceUrl.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(acceUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(acceUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]+$/)

    expect(gyroUrl.pathname).toBe(
      `/okarin-local/organizations/${organizationId}/recordings/${recordingId}/raw/gyro.csv`
    )
    expect(metadataUrl.pathname).toBe(
      `/okarin-local/organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
    )
  })

  it('floor map object key を保存規約どおりに組み立てる', () => {
    const objectKey = buildFloorMapObjectKey(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'png'
    )

    expect(objectKey).toBe(
      'maps/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png'
    )
    expect(getFloorMapExtensionFromObjectKey(objectKey)).toBe('png')
    expect(getFloorMapContentType('png')).toBe('image/png')
  })

  it('floor map の GET 用署名付き URL を生成できる', async () => {
    getStorageRuntimeConfigMock.mockReturnValue({
      accessKeyId: 'kaede-test',
      secretAccessKey: 'kaede-secret',
      internalEndpoint: 'http://seaweedfs:8333',
      publicEndpoint: 'http://127.0.0.1:8333',
      region: 'us-east-1',
      bucket: 'okarin-local',
      floorMapDownloadUrlTtlSeconds: 3600,
      recordingUploadUrlTtlSeconds: 900,
      trajectoryRawDownloadUrlTtlSeconds: 86400,
      trajectoryResultUploadUrlTtlSeconds: 86400,
    })
    const objectKey = buildFloorMapObjectKey(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'svg'
    )
    const now = new Date('2026-05-13T00:00:00.000Z')

    const download = await issueFloorMapDownloadUrl(objectKey, now)

    expect(download.expiresAt).toBe('2026-05-13T01:00:00.000Z')

    const downloadUrl = new URL(download.url)
    const expectedPath =
      '/okarin-local/maps/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.svg'

    expect(downloadUrl.origin).toBe('http://127.0.0.1:8333')
    expect(downloadUrl.pathname).toBe(expectedPath)
    expect(downloadUrl.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(downloadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
  })
})
