import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

export const createStorageClient = () => {
  return new S3Client({
    region: getRequiredEnv('S3_REGION'),
    endpoint: process.env.S3_INTERNAL_ENDPOINT,
    credentials: {
      accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  })
}

const readBody = async (body: AsyncIterable<Uint8Array>) => {
  const chunks: Uint8Array[] = []
  for await (const chunk of body) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

export const readObjectText = async (client: S3Client, key: string) => {
  const object = await client.send(
    new GetObjectCommand({
      Bucket: getRequiredEnv('S3_BUCKET'),
      Key: key,
    })
  )
  const body = object.Body

  if (!body || !(Symbol.asyncIterator in body)) {
    throw new Error('response body is not async iterable')
  }

  return readBody(body as AsyncIterable<Uint8Array>)
}

export const putObjectText = async (client: S3Client, key: string, body: string) => {
  await client.send(
    new PutObjectCommand({
      Bucket: getRequiredEnv('S3_BUCKET'),
      Key: key,
      Body: body,
      ContentType: 'text/csv',
    })
  )
}
