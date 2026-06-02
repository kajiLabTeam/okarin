import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
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
    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const csv = 'timestamp,x,y\n0,1,2\n'
    const { uploadUrls } = await issueRecordingUploadUrls(recordingId, ['acce'])
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
    await expect(readObjectText(s3, `recordings/${recordingId}/raw/acce.csv`)).resolves.toBe(csv)
  })

  it('発行した presigned URL に PUT した metadata.json を取得できる', async () => {
    const recordingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const metadata = '{"schema_version":1,"selected_sampling_rate":"100Hz"}\n'
    const { uploadUrls } = await issueRecordingUploadUrls(recordingId, ['metadata'])
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
    await expect(readObjectText(s3, `recordings/${recordingId}/raw/metadata.json`)).resolves.toBe(
      metadata
    )
  })
})
