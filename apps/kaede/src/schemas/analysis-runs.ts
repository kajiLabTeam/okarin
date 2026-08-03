import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'
import { paginationMetadataSchema, paginationQuerySchema } from './pagination.js'

const parameterSchema = (minimum: number, maximum: number) =>
  z
    .number()
    .finite()
    .min(minimum)
    .max(maximum)
    .refine((value) => Number.isInteger(value * 1000), 'must have at most 3 decimal places')

export const stayHeatmapParametersSchema = z
  .object({
    speed_threshold_mps: parameterSchema(0, 2).default(0.5),
    grid_size_m: parameterSchema(0.1, 10).default(1),
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

const heatmapCellSchema = z
  .object({
    grid_column: z.number().int().min(0),
    grid_row: z.number().int().min(0),
    stay_cell_visit_count: z.number().int().positive(),
  })
  .strict()

export const stayHeatmapArtifactSchema = z
  .object({
    schema_version: z.literal('1.0'),
    definition_version: z.literal('original-v1'),
    parameters: z
      .object({
        speed_threshold_mps: parameterSchema(0, 2),
        grid_size_m: parameterSchema(0.1, 10),
      })
      .strict(),
    floor_map: z
      .object({
        width_px: z.number().int().positive(),
        height_px: z.number().int().positive(),
        scale_m_per_px: z.number().positive().finite(),
      })
      .strict(),
    grid: z
      .object({
        size_m: z.number().positive().finite(),
        column_count: z.number().int().positive(),
        row_count: z.number().int().positive(),
      })
      .strict(),
    input_trajectory_count: z.number().int().positive(),
    trajectories: z.array(
      z
        .object({
          trajectory_id: uuidSchema,
          cells: z.array(heatmapCellSchema),
        })
        .strict()
        .superRefine((trajectory, ctx) => {
          const cells = trajectory.cells.map((cell) => `${cell.grid_row}:${cell.grid_column}`)
          if (new Set(cells).size !== cells.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cells must be unique' })
          }
        })
    ),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    const ids = artifact.trajectories.map((trajectory) => trajectory.trajectory_id)
    if (artifact.input_trajectory_count !== artifact.trajectories.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'trajectory count does not match' })
    }
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'trajectory IDs must be unique' })
    }
    for (const trajectory of artifact.trajectories) {
      for (const cell of trajectory.cells) {
        if (
          cell.grid_column >= artifact.grid.column_count ||
          cell.grid_row >= artifact.grid.row_count
        ) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cell must be inside the grid' })
        }
      }
    }
  })
  .openapi('StayHeatmapArtifact')

export const analysisCallbackRequestSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        analysis_run_id: uuidSchema,
        status: z.literal('completed'),
        callback_token: z.string().min(1),
      })
      .strict(),
    z
      .object({
        analysis_run_id: uuidSchema,
        status: z.literal('failed'),
        callback_token: z.string().min(1),
        error_code: z.string().min(1).max(100),
        error_message: z.string().min(1).max(500),
      })
      .strict(),
  ])
  .openapi('AnalysisCallbackRequest')

export const analysisCallbackResponseSchema = z
  .object({
    analysis_run_id: uuidSchema,
    status: z.enum(['completed', 'failed']),
  })
  .openapi('AnalysisCallbackResponse')

export const analysisCallbackErrorResponseSchema = z
  .object({
    error_code: z.string(),
    error_message: z.string(),
  })
  .openapi('AnalysisCallbackErrorResponse')

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
export type AnalysisCallbackRequest = z.infer<typeof analysisCallbackRequestSchema>
