import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, trajectoryStatusSchema, uuidSchema } from './common.js'

const finiteNumberSchema = z.number().finite()

const startConstraintSchema = z.object({
  seq: z.number().int().min(0),
  point_type: z.literal('start'),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  direction: finiteNumberSchema.optional(),
})

const waypointConstraintSchema = z.object({
  seq: z.number().int().min(0),
  point_type: z.literal('waypoint'),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  direction: finiteNumberSchema.optional(),
  relative_timestamp: z.number().int().min(0),
})

const goalConstraintSchema = z.object({
  seq: z.number().int().min(0),
  point_type: z.literal('goal'),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  direction: finiteNumberSchema.optional(),
})

export const trajectoryConstraintSchema = z.discriminatedUnion('point_type', [
  startConstraintSchema,
  waypointConstraintSchema,
  goalConstraintSchema,
])

export const createTrajectoryRequestSchema = z
  .object({
    constraints: z.array(trajectoryConstraintSchema).min(1),
  })
  .superRefine((input, ctx) => {
    const startCount = input.constraints.filter((point) => point.point_type === 'start').length
    const goalCount = input.constraints.filter((point) => point.point_type === 'goal').length
    const seqs = input.constraints.map((point) => point.seq)

    if (startCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraints must contain exactly one start point',
        path: ['constraints'],
      })
    }

    if (goalCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraints must contain at most one goal point',
        path: ['constraints'],
      })
    }

    if (new Set(seqs).size !== seqs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constraint seq must be unique',
        path: ['constraints'],
      })
    }
  })

export const trajectoryIdParamsSchema = z.object({
  trajectoryId: uuidSchema,
})

export const createTrajectoryResponseSchema = z.object({
  trajectory_id: uuidSchema,
  recording_id: uuidSchema,
  status: z.literal('processing'),
})

export const callbackRequestSchema = z.discriminatedUnion('status', [
  z.object({
    trajectory_id: uuidSchema,
    status: z.literal('completed'),
    callback_token: z.string().min(1),
    result_object_key: z.string().min(1),
  }),
  z.object({
    trajectory_id: uuidSchema,
    status: z.literal('failed'),
    callback_token: z.string().min(1),
    error_code: z.string().min(1),
    error_message: z.string().min(1),
  }),
])

export const callbackResponseSchema = z.object({
  trajectory_id: uuidSchema,
  status: trajectoryStatusSchema,
})

export const trajectoryStatusResponseSchema = z.object({
  trajectory_id: uuidSchema,
  recording_id: uuidSchema,
  status: trajectoryStatusSchema,
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  failed_at: isoDatetimeSchema.nullable(),
})

export type CreateTrajectoryRequest = z.infer<typeof createTrajectoryRequestSchema>
export type CallbackRequest = z.infer<typeof callbackRequestSchema>
