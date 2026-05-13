import { inject } from 'vitest'

// globalSetup が provide する databaseUrl を inject で受けるための Vitest 型拡張
declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

process.env.DATABASE_URL = inject('databaseUrl')
process.env.S3_ACCESS_KEY_ID ??= 'kaede-test'
process.env.S3_SECRET_ACCESS_KEY ??= 'change_me_test_kaede_secret_key'
process.env.S3_ENDPOINT ??= 'http://127.0.0.1:8333'
process.env.S3_REGION ??= 'us-east-1'
process.env.S3_BUCKET ??= 'okarin-test'
