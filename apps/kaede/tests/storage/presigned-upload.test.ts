import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  putFloorMapObject,
  issueRecordingUploadUrls,
  resetS3ClientForTests,
} from '../../src/services/storage/index.js'
import { createStorageClient, readObjectText } from './support/helpers.js'

const s3 = createStorageClient()

describe('presigned upload integration', () => {
  beforeEach(() => {
    resetS3ClientForTests()
  })

  afterAll(() => {
    s3.destroy()
  })

  it('発行した presigned URL に PUT した CSV を取得できる', async () => {
    const organizationId = '99999999-9999-4999-8999-999999999999'
    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const csv = 'timestamp,x,y\n0,1,2\n'
    const { uploadUrls } = await issueRecordingUploadUrls(organizationId, recordingId, ['acce'])
    const uploadUrl = uploadUrls.acce

    expect(uploadUrl).toBeDefined()
    if (!uploadUrl) {
      throw new Error('acce upload URL is not defined')
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: csv,
      headers: {
        'content-type': 'text/csv',
      },
    })

    expect(uploadResponse.ok).toBe(true)
    await expect(
      readObjectText(s3, `organizations/${organizationId}/recordings/${recordingId}/raw/acce.csv`)
    ).resolves.toBe(csv)
  }, 30000)

  it('発行した presigned URL に PUT した metadata.json を取得できる', async () => {
    const organizationId = '88888888-8888-4888-8888-888888888888'
    const recordingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const metadata = '{"schema_version":1,"selected_sampling_rate":"100Hz"}\n'
    const { uploadUrls } = await issueRecordingUploadUrls(organizationId, recordingId, ['metadata'])
    const uploadUrl = uploadUrls.metadata

    expect(uploadUrl).toBeDefined()
    if (!uploadUrl) {
      throw new Error('metadata upload URL is not defined')
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: metadata,
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(uploadResponse.ok).toBe(true)
    await expect(
      readObjectText(
        s3,
        `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
      )
    ).resolves.toBe(metadata)
  }, 30000)

  it('floor map object を API 内部用 helper で保存できる', async () => {
    const objectKey =
      'maps/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.svg'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

    await putFloorMapObject(objectKey, 'svg', new TextEncoder().encode(svg))

    await expect(readObjectText(s3, objectKey)).resolves.toBe(svg)
  }, 30000)
})
