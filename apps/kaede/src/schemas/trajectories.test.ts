import { describe, expect, it } from 'vitest'

import {
  callbackErrorResponseSchema,
  callbackRequestSchema,
  callbackErrorCodeSchema,
  cloneAndReanalyzeRequestSchema,
  createTrajectoryResponseSchema,
  createTrajectoryRequestSchema,
  retriedTrajectoryResponseSchema,
  trajectoryResultResponseSchema,
  trajectoryStatusResponseSchema,
  trajectoryMapDataQuerySchema,
  trajectoryMapDataResponseSchema,
  trajectoryIdParamsSchema,
  trajectoryConstraintsSchema,
  batchTrajectoryMapDataRequestSchema,
} from './trajectories.js'

describe('trajectory schemas', () => {
  it('createTrajectoryRequestSchema は constraints を省略した入力を受け入れる', () => {
    const result = createTrajectoryRequestSchema.safeParse({})

    expect(result.success).toBe(true)
    expect(result.data?.constraints).toBeUndefined()
  })

  it('createTrajectoryRequestSchema は null の constraints を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({ constraints: null })

    expect(result.success).toBe(false)
  })

  it('trajectoryConstraintsSchema は空配列を受け入れる', () => {
    const result = trajectoryConstraintsSchema.safeParse([])

    expect(result).toEqual({ success: true, data: [] })
  })

  it('createTrajectoryResponseSchema は organization_id を含むレスポンスを受け入れる', () => {
    const result = createTrajectoryResponseSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      recording_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      status: 'processing',
    })

    expect(result.success).toBe(true)
  })

  it('trajectoryStatusResponseSchema は organization_id を含むレスポンスを受け入れる', () => {
    const result = trajectoryStatusResponseSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      recording_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      status: 'failed',
      error_code: 'NOZOMI_REQUEST_FAILED',
      error_message: 'failed to submit analyze request to nozomi',
      failed_at: '2026-05-13T00:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('trajectoryResultResponseSchema は download_url を含むレスポンスを受け入れる', () => {
    const result = trajectoryResultResponseSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      download_url: 'https://storage.example.test/result.csv',
      expires_at: '2026-05-13T00:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('retriedTrajectoryResponseSchema は organization_id を含むレスポンスを受け入れる', () => {
    const result = retriedTrajectoryResponseSchema.safeParse({
      source_trajectory_id: '33333333-3333-4333-8333-333333333333',
      trajectory_id: '44444444-4444-4444-8444-444444444444',
      recording_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '99999999-9999-4999-8999-999999999999',
      status: 'processing',
    })

    expect(result.success).toBe(true)
  })

  it('createTrajectoryRequestSchema は空の constraints を受け入れる', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [],
    })

    expect(result).toEqual({ success: true, data: { constraints: [] } })
  })

  it('cloneAndReanalyzeRequestSchema は空の constraints を拒否する', () => {
    const result = cloneAndReanalyzeRequestSchema.safeParse({
      constraints: [],
    })

    expect(result.success).toBe(false)
  })

  it('cloneAndReanalyzeRequestSchema は constraints 省略を拒否する', () => {
    const result = cloneAndReanalyzeRequestSchema.safeParse({})

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は start 1 件と waypoint を含む入力を受け入れる', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
        },
        {
          seq: 1,
          point_type: 'waypoint',
          x: 1,
          y: 1,
          relative_timestamp: 1000,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('createTrajectoryRequestSchema は start を含まない入力を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'waypoint',
          x: 1,
          y: 1,
          relative_timestamp: 1000,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は重複した seq を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
        },
        {
          seq: 0,
          point_type: 'goal',
          x: 2,
          y: 2,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は複数の goal を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
        },
        {
          seq: 1,
          point_type: 'goal',
          x: 2,
          y: 2,
        },
        {
          seq: 2,
          point_type: 'goal',
          x: 3,
          y: 3,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は seq に欠番がある入力を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
        },
        {
          seq: 2,
          point_type: 'goal',
          x: 2,
          y: 2,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は配列順と seq が一致しない入力を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 1,
          point_type: 'waypoint',
          x: 1,
          y: 1,
          relative_timestamp: 1000,
        },
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('createTrajectoryRequestSchema は 360 度以上の direction を拒否する', () => {
    const result = createTrajectoryRequestSchema.safeParse({
      constraints: [
        {
          seq: 0,
          point_type: 'start',
          x: 0,
          y: 0,
          direction: 360,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('callbackRequestSchema は completed callback を受け入れる', () => {
    const result = callbackRequestSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      status: 'completed',
      callback_token: 'signed-token',
      result_object_key: 'trajectories/33333333-3333-4333-8333-333333333333/analyzed/result.csv',
    })

    expect(result.success).toBe(true)
  })

  it('callbackRequestSchema は result_object_key のない completed callback を拒否する', () => {
    const result = callbackRequestSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      status: 'completed',
      callback_token: 'signed-token',
    })

    expect(result.success).toBe(false)
  })

  it('callbackRequestSchema は failed callback を受け入れる', () => {
    const result = callbackRequestSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      status: 'failed',
      callback_token: 'signed-token',
      error_code: 'NOZOMI_ERROR',
      error_message: 'analysis failed',
    })

    expect(result.success).toBe(true)
  })

  it('callbackErrorCodeSchema は定義済み callback error code を受け入れる', () => {
    const result = callbackErrorCodeSchema.safeParse('CALLBACK_TOKEN_EXPIRED')

    expect(result.success).toBe(true)
  })

  it('callbackErrorCodeSchema は未知の callback error code を拒否する', () => {
    const result = callbackErrorCodeSchema.safeParse('UNKNOWN_CALLBACK_ERROR')

    expect(result.success).toBe(false)
  })

  it('callbackErrorResponseSchema は enum に含まれる error_code を受け入れる', () => {
    const result = callbackErrorResponseSchema.safeParse({
      error_code: 'CALLBACK_DEPENDENCY_FAILURE',
      error_message: 'failed to verify object or update trajectory state',
    })

    expect(result.success).toBe(true)
  })

  it('trajectoryMapDataQuerySchema は data_type を必須とする', () => {
    const result = trajectoryMapDataQuerySchema.safeParse({
      data_type: 'analyzed',
    })

    expect(result.success).toBe(true)
  })

  it('trajectoryMapDataResponseSchema は描画用pointsを受け入れる', () => {
    const result = trajectoryMapDataResponseSchema.safeParse({
      trajectory_id: '33333333-3333-4333-8333-333333333333',
      floor_id: '11111111-1111-4111-8111-111111111111',
      data_type: 'analyzed',
      points: [
        {
          timestamp: 0,
          x: 10,
          y: 20,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('batchTrajectoryMapDataRequestSchema は data_type を必須とする', () => {
    const result = batchTrajectoryMapDataRequestSchema.safeParse({
      data_type: 'ground_truth',
      trajectory_ids: ['33333333-3333-4333-8333-333333333333'],
    })

    expect(result.success).toBe(true)
  })

  it('batchTrajectoryMapDataRequestSchema は data_type がない入力を拒否する', () => {
    const result = batchTrajectoryMapDataRequestSchema.safeParse({
      trajectory_ids: ['33333333-3333-4333-8333-333333333333'],
    })

    expect(result.success).toBe(false)
  })

  it('trajectoryIdParamsSchema は UUID でない trajectoryId を拒否する', () => {
    const result = trajectoryIdParamsSchema.safeParse({
      trajectoryId: 'invalid-id',
    })

    expect(result.success).toBe(false)
  })
})
