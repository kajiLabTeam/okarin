import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'

export const positioningAnalysisCallbackRequestSchema = z
  .object({
    event_id: z.string().min(1).max(200),
    analysis_run_item_id: uuidSchema,
    status: z.enum(['processing', 'completed', 'failed']),
    outputs: z.record(z.unknown()).optional(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .openapi('PositioningAnalysisCallbackRequest')

export const positioningAnalysisCallbackResponseSchema = z
  .object({
    event_id: z.string(),
    status: z.enum(['accepted', 'already_processed']),
  })
  .openapi('PositioningAnalysisCallbackResponse')

export type PositioningAnalysisCallbackRequest = z.infer<
  typeof positioningAnalysisCallbackRequestSchema
>
export type PositioningAnalysisCallbackResponse = z.infer<
  typeof positioningAnalysisCallbackResponseSchema
>
