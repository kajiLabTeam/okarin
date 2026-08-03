import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'

const parameterSchema = (minimum: number, maximum: number, defaultValue: number) =>
  z
    .number()
    .finite()
    .min(minimum)
    .max(maximum)
    .refine((value) => Number.isInteger(value * 1000), 'must have at most 3 decimal places')
    .default(defaultValue)

export const stayHeatmapParametersSchema = z
  .object({
    speed_threshold_mps: parameterSchema(0, 2, 0.5),
    grid_size_m: parameterSchema(0.1, 10, 1),
  })
  .strict()
  .openapi('StayHeatmapParameters')

export const createStayHeatmapRequestSchema = z
  .object({
    trajectory_ids: z
      .array(uuidSchema)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'trajectory_ids must be unique'),
    parameters: stayHeatmapParametersSchema.default({
      speed_threshold_mps: 0.5,
      grid_size_m: 1,
    }),
  })
  .strict()
  .openapi('CreateStayHeatmapRequest')

export const createStayHeatmapResponseSchema = z
  .object({
    analysis_run_id: uuidSchema,
    status: z.literal('processing'),
  })
  .openapi('CreateStayHeatmapResponse')

export const createStayHeatmapErrorResponseSchema = z
  .object({
    error_code: z.string(),
    error_message: z.string(),
    analysis_run_id: uuidSchema.optional(),
  })
  .openapi('CreateStayHeatmapErrorResponse')

export type CreateStayHeatmapRequest = z.infer<typeof createStayHeatmapRequestSchema>
export type StayHeatmapParameters = z.infer<typeof stayHeatmapParametersSchema>
