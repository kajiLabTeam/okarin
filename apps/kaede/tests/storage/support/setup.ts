import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    s3AccessKeyId: string
    s3Bucket: string
    s3Endpoint: string
    s3Region: string
    s3SecretAccessKey: string
  }
}

process.env.S3_ACCESS_KEY_ID = inject('s3AccessKeyId')
process.env.S3_SECRET_ACCESS_KEY = inject('s3SecretAccessKey')
process.env.S3_ENDPOINT = inject('s3Endpoint')
process.env.S3_REGION = inject('s3Region')
process.env.S3_BUCKET = inject('s3Bucket')
