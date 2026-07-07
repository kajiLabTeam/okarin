import { describe, expect, it } from 'vitest'

import {
  groundTruthTypeSchema,
  initRecordingResponseSchema,
  initRecordingRequestSchema,
  recordingDetailResponseSchema,
  recordingIdParamsSchema,
  recordingGroundTruthRequestSchema,
  recordingTrajectoriesResponseSchema,
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
    expect(result.data?.constraints).toBeUndefined()
  })

  it('initRecordingRequestSchema は constraints を受け入れ、null は拒否する', () => {
    const input = {
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'gyro'],
    }
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]

    expect(initRecordingRequestSchema.safeParse({ ...input, constraints })).toEqual({
      success: true,
      data: { ...input, constraints },
    })
    expect(initRecordingRequestSchema.safeParse({ ...input, constraints: null }).success).toBe(
      false
    )
  })

  it('initRecordingRequestSchema は必須センサーが不足した upload_targets を拒否する', () => {
    const result = initRecordingRequestSchema.safeParse({
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      upload_targets: ['acce', 'wifi'],
    })

    expect(result.success).toBe(false)
  })

  it('initRecordingResponseSchema は organization_id を含むレスポンスを受け入れる', () => {
    const result = initRecordingResponseSchema.safeParse({
      recording_id: '33333333-3333-4333-8333-333333333333',
      organization_id: '99999999-9999-4999-8999-999999999999',
      upload_status: 'accepted',
      upload_urls: {
        acce: 'https://storage.example.test/acce',
        gyro: 'https://storage.example.test/gyro',
        metadata: 'https://storage.example.test/metadata',
      },
      expires_at: '2026-05-13T00:15:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('recordingDetailResponseSchema は organization_id を含むレスポンスを受け入れる', () => {
    const result = recordingDetailResponseSchema.safeParse({
      recording_id: '33333333-3333-4333-8333-333333333333',
      pedestrian_id: '11111111-1111-4111-8111-111111111111',
      floor_id: '22222222-2222-4222-8222-222222222222',
      organization_id: '99999999-9999-4999-8999-999999999999',
      upload_status: 'ready',
      upload_targets: ['acce', 'gyro'],
      created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:01:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('recordingTrajectoriesResponseSchema は trajectory の organization_id を含むレスポンスを受け入れる', () => {
    const result = recordingTrajectoriesResponseSchema.safeParse({
      recording_id: '33333333-3333-4333-8333-333333333333',
      trajectories: [
        {
          trajectory_id: '44444444-4444-4444-8444-444444444444',
          organization_id: '99999999-9999-4999-8999-999999999999',
          status: 'processing',
          created_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })

    expect(result.success).toBe(true)
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

  it('refreshUploadUrlsRequestSchema は重複した targets を拒否する', () => {
    const result = refreshUploadUrlsRequestSchema.safeParse({
      targets: ['acce', 'acce'],
    })

    expect(result.success).toBe(false)
  })

  it('recordingGroundTruthRequestSchema は truth_type=uwb を受け入れる', () => {
    const result = recordingGroundTruthRequestSchema.safeParse({
      truth_type: 'uwb',
    })

    expect(result.success).toBe(true)
  })

  it('groundTruthTypeSchema は未知の truth_type を拒否する', () => {
    const result = groundTruthTypeSchema.safeParse('beacon')

    expect(result.success).toBe(false)
  })
})
