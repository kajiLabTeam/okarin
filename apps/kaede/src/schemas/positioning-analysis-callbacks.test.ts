import { describe, expect, it } from 'vitest'
import {
  positioningAnalysisCallbackRequestSchema,
  positioningAnalysisCallbackResponseSchema,
} from './positioning-analysis-callbacks.js'

describe('positioningAnalysisCallbackRequestSchema', () => {
  const validItemId = '11111111-1111-4111-8111-111111111111'

  it('completed イベントのスキーマを正常にパースする', () => {
    const input = {
      event_id: 'event-1',
      analysis_run_item_id: validItemId,
      status: 'completed',
      outputs: {
        trajectory_geojson: { type: 'FeatureCollection', features: [] },
      },
    }
    const parsed = positioningAnalysisCallbackRequestSchema.safeParse(input)
    expect(parsed.success).toBe(true)
  })

  it('failed イベントのスキーマを正常にパースする', () => {
    const input = {
      event_id: 'event-2',
      analysis_run_item_id: validItemId,
      status: 'failed',
      error: {
        code: 'algorithm_failed',
        message: 'Convergence error',
      },
    }
    const parsed = positioningAnalysisCallbackRequestSchema.safeParse(input)
    expect(parsed.success).toBe(true)
  })

  it('不正なUUIDの場合は拒否する', () => {
    const input = {
      event_id: 'event-3',
      analysis_run_item_id: 'not-a-uuid',
      status: 'completed',
    }
    const parsed = positioningAnalysisCallbackRequestSchema.safeParse(input)
    expect(parsed.success).toBe(false)
  })
})

describe('positioningAnalysisCallbackResponseSchema', () => {
  it('レスポンススキーマを正常にパースする', () => {
    const input = {
      event_id: 'event-1',
      status: 'accepted',
    }
    const parsed = positioningAnalysisCallbackResponseSchema.safeParse(input)
    expect(parsed.success).toBe(true)
  })
})
