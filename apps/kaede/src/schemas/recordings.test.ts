import { describe, expect, it } from 'vitest'

import {
  initRecordingRequestSchema,
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
} from './recordings.js'

describe('recording schemas', () => {
  it('initRecordingRequestSchema は正しい recording 作成リクエストを受け入れる', () => {
    const result = initRecordingRequestSchema.safeParse({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'gyro', 'wifi'],
    })

    expect(result.success).toBe(true)
  })

  it('initRecordingRequestSchema は必須センサーが不足した upload_targets を拒否する', () => {
    const result = initRecordingRequestSchema.safeParse({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'wifi'],
    })

    expect(result.success).toBe(false)
  })

  it('recordingIdParamsSchema は UUID でない recordingId を拒否する', () => {
    const result = recordingIdParamsSchema.safeParse({
      recordingId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
  })

  it('refreshUploadUrlsRequestSchema は 1 件以上の target を受け入れる', () => {
    const result = refreshUploadUrlsRequestSchema.safeParse({
      targets: ['pressure'],
    })

    expect(result.success).toBe(true)
  })

  it('refreshUploadUrlsRequestSchema は空の targets を拒否する', () => {
    const result = refreshUploadUrlsRequestSchema.safeParse({
      targets: [],
    })

    expect(result.success).toBe(false)
  })
})
