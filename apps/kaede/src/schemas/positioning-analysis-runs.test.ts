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

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
it('失敗分の再実行には元runと重複しない処理IDが必要', () => {
  const base = { recording_ids: [id(1)], pipeline_ids: ['pdr'], retry_failed_item_ids: [id(2)] }
  expect(positioningAnalysisRunRequestSchema.safeParse(base).success).toBe(false)
  expect(
    positioningAnalysisRunRequestSchema.safeParse({ ...base, retry_of_analysis_run_id: id(3) })
      .success
  ).toBe(true)
  expect(
    positioningAnalysisRunRequestSchema.safeParse({
      ...base,
      retry_of_analysis_run_id: id(3),
      retry_failed_item_ids: [id(2), id(2)],
    }).success
  ).toBe(false)
})
it('再実行の200件上限は全組み合わせではなく指定した失敗セルの件数で判定する', () => {
  expect(
    positioningAnalysisRunRequestSchema.safeParse({
      recording_ids: Array.from({ length: 50 }, (_, i) => id(i + 1)),
      pipeline_ids: Array.from({ length: 10 }, (_, i) => `pipeline-${i}`),
      retry_of_analysis_run_id: id(1000),
      retry_failed_item_ids: Array.from({ length: 50 }, (_, i) => id(i + 100)),
    }).success
  ).toBe(true)
})

it('全件再実行の対象IDにも元runを要求し、失敗分指定との混在を拒否する', () => {
  const body = { recording_ids: [id(1)], pipeline_ids: ['pdr'], retry_item_ids: [id(2)] }
  expect(positioningAnalysisRunRequestSchema.safeParse(body).success).toBe(false)
  expect(
    positioningAnalysisRunRequestSchema.safeParse({ ...body, retry_of_analysis_run_id: id(3) })
      .success
  ).toBe(true)
  expect(
    positioningAnalysisRunRequestSchema.safeParse({
      ...body,
      retry_of_analysis_run_id: id(3),
      retry_failed_item_ids: [id(2)],
    }).success
  ).toBe(false)
})
