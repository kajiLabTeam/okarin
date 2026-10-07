import { describe, expect, it } from 'vitest'
import { positioningAnalysisRunRequestSchema } from './positioning-analysis-runs.js'

describe('positioning analysis run request', () => {
  it('accepts a matrix of recordings and pipelines', () => {
    const result = positioningAnalysisRunRequestSchema.safeParse({
      recording_ids: ['11111111-1111-4111-8111-111111111111'],
      pipeline_ids: ['pdr', 'pdr-particle-filter'],
      parameters_by_pipeline: { pdr: { step_length: 0.7 } },
    })
    expect(result.success).toBe(true)
  })

  it('rejects duplicate recordings and pipelines', () => {
    const result = positioningAnalysisRunRequestSchema.safeParse({
      recording_ids: [
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ],
      pipeline_ids: ['pdr', 'pdr'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects parameters for a pipeline that is not selected', () => {
    const result = positioningAnalysisRunRequestSchema.safeParse({
      recording_ids: ['11111111-1111-4111-8111-111111111111'],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: { 'pdr-particle-filter': {} },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a matrix over the MVP combination limit', () => {
    const result = positioningAnalysisRunRequestSchema.safeParse({
      recording_ids: Array.from(
        { length: 21 },
        (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`
      ),
      pipeline_ids: Array.from({ length: 10 }, (_, index) => `pdr-${index}`),
    })
    expect(result.success).toBe(false)
  })
})
