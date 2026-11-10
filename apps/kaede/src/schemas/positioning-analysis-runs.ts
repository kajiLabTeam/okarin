import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'
import { paginationMetadataSchema, paginationQuerySchema } from './pagination.js'

export const positioningAnalysisRunRequestSchema = z
  .object({
    recording_ids: z.array(uuidSchema).min(1).max(50),
    pipeline_ids: z.array(z.string().min(1).max(100)).min(1).max(10),
    parameters_by_pipeline: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    retry_of_analysis_run_id: uuidSchema.optional(),
    retry_failed_item_ids: z.array(uuidSchema).min(1).max(200).optional(),
    retry_item_ids: z.array(uuidSchema).min(1).max(200).optional(),
    ground_truth_csv: z.string().min(1).max(20_000_000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.recording_ids).size !== v.recording_ids.length)
      ctx.addIssue({ code: 'custom', message: 'recording_ids must be unique' })
    if (new Set(v.pipeline_ids).size !== v.pipeline_ids.length)
      ctx.addIssue({ code: 'custom', message: 'pipeline_ids must be unique' })
    const retryIds = v.retry_failed_item_ids ?? v.retry_item_ids
    if ((retryIds?.length ?? v.recording_ids.length * v.pipeline_ids.length) > 200)
      ctx.addIssue({
        code: 'custom',
        message: 'recording/pipeline combinations must not exceed 200',
      })
    if (retryIds && (!v.retry_of_analysis_run_id || new Set(retryIds).size !== retryIds.length))
      ctx.addIssue({
        code: 'custom',
        message: 'retry item IDs require a parent run and unique item IDs',
      })
    if (v.retry_failed_item_ids && v.retry_item_ids)
      ctx.addIssue({
        code: 'custom',
        message: 'retry_failed_item_ids and retry_item_ids are mutually exclusive',
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

export const positioningRunVideoProgressSchema = z.object({
  processing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

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
    video_progress: positioningRunVideoProgressSchema.optional(),
    comparison_run_id: uuidSchema.optional(),
    items: z.array(
      z.object({
        id: uuidSchema,
        recording_id: uuidSchema,
        pipeline_id: z.string(),
        status: z.enum(['queued', 'processing', 'completed', 'failed']),
        result_trajectory_id: uuidSchema.nullable(),
        pipeline_digest: z.string(),
        pipeline_version: z.string(),
        error: z.record(z.string(), z.unknown()).nullable(),
      })
    ),
  })
  .openapi('PositioningAnalysisRunDetail')

export type PositioningAnalysisRunRequest = z.infer<typeof positioningAnalysisRunRequestSchema>

export const positioningAnalysisRunListQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['all', 'in_progress', 'failed']).default('all'),
})

export const positioningAnalysisRunListSchema = z
  .object({
    analysis_runs: z.array(
      z.object({
        analysis_run_id: uuidSchema,
        created_at: z.iso.datetime(),
        updated_at: z.iso.datetime(),
        status: positioningAnalysisRunResponseSchema.shape.status,
        recording_count: z.number().int().nonnegative(),
        pipeline_ids: z.array(z.string()),
        progress: positioningAnalysisRunDetailSchema.shape.progress,
        video_progress: positioningRunVideoProgressSchema,
      })
    ),
    in_progress_count: z.number().int().nonnegative(),
    pagination: paginationMetadataSchema,
  })
  .openapi('PositioningAnalysisRunList')

export type PositioningAnalysisRunListQuery = z.infer<typeof positioningAnalysisRunListQuerySchema>
