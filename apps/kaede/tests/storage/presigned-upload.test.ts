import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  issueRecordingUploadUrls,
  resetS3ClientForTests,
} from '../../src/services/storage/index.js'

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

const s3 = new S3Client({
  region: getRequiredEnv('S3_REGION'),
  endpoint: process.env.S3_INTERNAL_ENDPOINT,
  credentials: {
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
})

const readBody = async (body: AsyncIterable<Uint8Array>) => {
  const chunks: Uint8Array[] = []
  for await (const chunk of body) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

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

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `recordings/${recordingId}/raw/acce.csv`,
      })
    )
    const body = object.Body

    expect(body).toBeDefined()
    if (!body || !(Symbol.asyncIterator in body)) {
      throw new Error('response body is not async iterable')
    }

    await expect(readBody(body as AsyncIterable<Uint8Array>)).resolves.toBe(csv)
  })
})
