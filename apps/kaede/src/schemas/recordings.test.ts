import { describe, expect, it } from 'vitest'

import {
  initRecordingRequestSchema,
  recordingIdParamsSchema,
  refreshUploadUrlsRequestSchema,
} from './recordings.js'

describe('recording schemas', () => {
  it('initRecordingRequestSchema accepts valid recording init payload', () => {
    const result = initRecordingRequestSchema.safeParse({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'gyro', 'wifi'],
    })

    expect(result.success).toBe(true)
  })

  it('initRecordingRequestSchema rejects upload_targets without required sensors', () => {
    const result = initRecordingRequestSchema.safeParse({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'wifi'],
    })

    expect(result.success).toBe(false)
  })

  it('recordingIdParamsSchema rejects non-uuid recordingId', () => {
    const result = recordingIdParamsSchema.safeParse({
      recordingId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
  })

  it('refreshUploadUrlsRequestSchema accepts one or more targets', () => {
    const result = refreshUploadUrlsRequestSchema.safeParse({
      targets: ['pressure'],
    })

    expect(result.success).toBe(true)
  })

  it('refreshUploadUrlsRequestSchema rejects empty targets', () => {
    const result = refreshUploadUrlsRequestSchema.safeParse({
      targets: [],
    })

    expect(result.success).toBe(false)
  })
})
