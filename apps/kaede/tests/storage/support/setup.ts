import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    s3AccessKeyId: string
    s3Bucket: string
    s3InternalEndpoint: string
    s3PublicEndpoint: string
    s3Region: string
    s3SecretAccessKey: string
  }
}

process.env.DATABASE_URL = inject('databaseUrl')
process.env.S3_ACCESS_KEY_ID = inject('s3AccessKeyId')
process.env.S3_SECRET_ACCESS_KEY = inject('s3SecretAccessKey')
process.env.S3_INTERNAL_ENDPOINT = inject('s3InternalEndpoint')
process.env.S3_PUBLIC_ENDPOINT = inject('s3PublicEndpoint')
process.env.S3_REGION = inject('s3Region')
process.env.S3_BUCKET = inject('s3Bucket')
process.env.NOZOMI_INTERNAL_ENDPOINT ??= 'http://127.0.0.1:8000'
process.env.KAEDE_INTERNAL_BASE_URL ??= 'http://kaede:8080'
process.env.FRONTEND_ORIGIN ??= 'http://dashboard.example.test'
process.env.CALLBACK_TOKEN_SECRET ??= 'change_me_test_callback_secret'
