import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'
import { paginationMetadataSchema, paginationQuerySchema } from './pagination.js'

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

const analysisRunStatusSchema = z.enum(['accepted', 'processing', 'completed', 'failed'])
const trajectoryCountsSchema = z.object({
  input: z.number().int().nonnegative(),
  included: z.number().int().nonnegative(),
  excluded_deleted: z.number().int().nonnegative(),
})
const analysisRunErrorSchema = z.object({ code: z.string(), message: z.string() }).nullable()
const nullableDateTimeSchema = z.string().datetime().nullable()

export const analysisRunParamsSchema = z.object({
  organizationId: uuidSchema,
  analysisRunId: uuidSchema,
})

export const listAnalysisRunsQuerySchema = paginationQuerySchema
  .extend({
    analysis_type: z.string().min(1).optional(),
    status: analysisRunStatusSchema.optional(),
    floor_id: uuidSchema.optional(),
  })
  .strict()

const analysisRunSummarySchema = z.object({
  analysis_run_id: uuidSchema,
  analysis_type: z.string(),
  status: analysisRunStatusSchema,
  floor_id: uuidSchema,
  parameters: stayHeatmapParametersSchema,
  definition_version: z.string(),
  trajectory_counts: trajectoryCountsSchema,
  error: analysisRunErrorSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  finished_at: nullableDateTimeSchema,
})

export const analysisRunListResponseSchema = z.object({
  analysis_runs: z.array(analysisRunSummarySchema),
  pagination: paginationMetadataSchema,
})

export const analysisRunDetailResponseSchema = analysisRunSummarySchema.extend({
  trajectories: z.array(
    z.object({
      trajectory_id: uuidSchema,
      seq: z.number().int().nonnegative(),
      deleted: z.boolean(),
    })
  ),
  started_at: nullableDateTimeSchema,
  deadline_at: z.string().datetime(),
})

const heatmapCellSchema = z.object({
  grid_column: z.number().int().nonnegative(),
  grid_row: z.number().int().nonnegative(),
  stay_cell_visit_count: z.number().int().positive(),
})

export const stayHeatmapArtifactSchema = z
  .object({
    schema_version: z.literal('1.0'),
    definition_version: z.string(),
    parameters: stayHeatmapParametersSchema,
    floor_map: z.object({
      width_px: z.number().int().positive(),
      height_px: z.number().int().positive(),
      scale_m_per_px: z.number().positive(),
    }),
    grid: z.object({
      size_m: z.number().positive(),
      column_count: z.number().int().positive(),
      row_count: z.number().int().positive(),
    }),
    input_trajectory_count: z.number().int().nonnegative(),
    trajectories: z.array(
      z.object({ trajectory_id: uuidSchema, cells: z.array(heatmapCellSchema) })
    ),
  })
  .strict()

export const analysisRunResultResponseSchema = z.object({
  analysis_run_id: uuidSchema,
  analysis_type: z.literal('stay_heatmap'),
  status: z.literal('completed'),
  definition_version: z.string(),
  floor: z.object({
    id: uuidSchema,
    map_width_px: z.number().int().positive(),
    map_height_px: z.number().int().positive(),
    scale_m_per_px: z.number().positive(),
  }),
  parameters: stayHeatmapParametersSchema,
  grid: z.object({
    column_count: z.number().int().positive(),
    row_count: z.number().int().positive(),
    cells: z.array(
      z.object({
        grid_column: z.number().int().nonnegative(),
        grid_row: z.number().int().nonnegative(),
        total_stay_cell_visit_count: z.number().int().positive(),
        mean_stay_cell_visit_count: z.number().nonnegative(),
      })
    ),
  }),
  trajectory_counts: trajectoryCountsSchema,
  trajectory_csvs: z.array(
    z.object({ trajectory_id: uuidSchema, download_url: z.string().url(), expires_at: z.string() })
  ),
})

export type ListAnalysisRunsQuery = z.infer<typeof listAnalysisRunsQuerySchema>
