import { z } from '@hono/zod-openapi'

export const uuidSchema = z.string().uuid()

export const isoDatetimeSchema = z.string().datetime({ offset: true })

export const recordingUploadStatusSchema = z.enum(['accepted', 'ready', 'failed'])

export const trajectoryStatusSchema = z.enum(['accepted', 'processing', 'completed', 'failed'])

export const uploadTargetSchema = z.enum(['acce', 'gyro', 'pressure', 'wifi'])

export const uploadTargetsSchema = z
  .array(uploadTargetSchema)
  .min(2)
  .superRefine((targets, ctx) => {
    if (!targets.includes('acce')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'upload_targets must include acce',
      })
    }

    if (!targets.includes('gyro')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'upload_targets must include gyro',
      })
    }

    if (new Set(targets).size !== targets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'upload_targets must not contain duplicates',
      })
    }
  })

export const notImplementedResponseSchema = z.object({
  error: z.literal('NOT_IMPLEMENTED'),
  endpoint: z.string(),
  description: z.string(),
  params: z.record(z.string()).optional(),
})

export type RecordingUploadStatus = z.infer<typeof recordingUploadStatusSchema>
export type TrajectoryStatus = z.infer<typeof trajectoryStatusSchema>
export type UploadTarget = z.infer<typeof uploadTargetSchema>
