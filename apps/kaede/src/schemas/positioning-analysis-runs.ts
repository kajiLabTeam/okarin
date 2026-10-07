import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'

export const positioningAnalysisRunRequestSchema = z
  .object({
    recording_ids: z.array(uuidSchema).min(1).max(50),
    pipeline_ids: z.array(z.string().min(1).max(100)).min(1).max(10),
    parameters_by_pipeline: z.record(z.string(), z.record(z.unknown())).default({}),
    retry_of_analysis_run_id: uuidSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.recording_ids).size !== v.recording_ids.length)
      ctx.addIssue({ code: 'custom', message: 'recording_ids must be unique' })
    if (new Set(v.pipeline_ids).size !== v.pipeline_ids.length)
      ctx.addIssue({ code: 'custom', message: 'pipeline_ids must be unique' })
    if (v.recording_ids.length * v.pipeline_ids.length > 200)
      ctx.addIssue({
        code: 'custom',
        message: 'recording/pipeline combinations must not exceed 200',
      })
    const extra = Object.keys(v.parameters_by_pipeline).filter(
      (key) => !v.pipeline_ids.includes(key)
    )
    if (extra.length > 0)
      ctx.addIssue({
        code: 'custom',
        message: `parameters_by_pipeline contains unknown pipelines: ${extra.join(', ')}`,
      })
  })
  .openapi('CreatePositioningAnalysisRunRequest')

export const positioningAnalysisRunResponseSchema = z
  .object({
    analysis_run_id: uuidSchema,
    status: z.enum(['accepted', 'processing', 'completed', 'partially_completed', 'failed']),
    item_count: z.number().int().nonnegative(),
  })
  .openapi('CreatePositioningAnalysisRunResponse')

export const positioningAnalysisRunDetailSchema = z
  .object({
    analysis_run_id: uuidSchema,
    status: z.enum(['accepted', 'processing', 'completed', 'partially_completed', 'failed']),
    progress: z.object({
      total: z.number().int(),
      queued: z.number().int(),
      processing: z.number().int(),
      completed: z.number().int(),
      failed: z.number().int(),
    }),
    items: z.array(
      z.object({
        id: uuidSchema,
        recording_id: uuidSchema,
        pipeline_id: z.string(),
        status: z.enum(['queued', 'processing', 'completed', 'failed']),
        result_trajectory_id: uuidSchema.nullable(),
        pipeline_digest: z.string(),
        pipeline_version: z.string(),
        error: z.record(z.unknown()).nullable(),
      })
    ),
  })
  .openapi('PositioningAnalysisRunDetail')

export type PositioningAnalysisRunRequest = z.infer<typeof positioningAnalysisRunRequestSchema>
