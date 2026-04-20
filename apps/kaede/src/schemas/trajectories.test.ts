import { describe, expect, it } from 'vitest'

import {
  callbackRequestSchema,
  createTrajectoryRequestSchema,
  trajectoryIdParamsSchema,
} from './trajectories.js'

describe('trajectory schemas', () => {
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

  it('trajectoryIdParamsSchema は UUID でない trajectoryId を拒否する', () => {
    const result = trajectoryIdParamsSchema.safeParse({
      trajectoryId: 'invalid-id',
    })

    expect(result.success).toBe(false)
  })
})
