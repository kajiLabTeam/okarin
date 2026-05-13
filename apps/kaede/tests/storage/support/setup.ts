import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    s3AccessKeyId: string
    s3Bucket: string
    s3InternalEndpoint: string
    s3PublicEndpoint: string
    s3Region: string
    s3SecretAccessKey: string
  }
}

process.env.S3_ACCESS_KEY_ID = inject('s3AccessKeyId')
process.env.S3_SECRET_ACCESS_KEY = inject('s3SecretAccessKey')
process.env.S3_INTERNAL_ENDPOINT = inject('s3InternalEndpoint')
process.env.S3_PUBLIC_ENDPOINT = inject('s3PublicEndpoint')
process.env.S3_REGION = inject('s3Region')
process.env.S3_BUCKET = inject('s3Bucket')
