import { z } from '@hono/zod-openapi'

export const uuidSchema = z.string().uuid().openapi({
  description: 'UUID 形式の識別子',
  example: '550e8400-e29b-41d4-a716-446655440000',
})

export const isoDatetimeSchema = z.string().datetime({ offset: true }).openapi({
  description: 'タイムゾーン付き ISO 8601 日時',
  example: '2026-04-23T12:34:56+09:00',
})

export const recordingUploadStatusSchema = z.enum(['accepted', 'ready', 'failed']).openapi({
  description: 'recording のアップロード状態',
  'x-enum-descriptions': {
    accepted: 'recording を受け付けた直後の状態',
    ready: '必要なファイルのアップロードが完了し、次工程に進める状態',
    failed: 'アップロード処理または受け付け処理に失敗した状態',
  },
})

export const trajectoryStatusSchema = z
  .enum(['accepted', 'processing', 'completed', 'failed'])
  .openapi({
    description: 'trajectory の解析状態',
    'x-enum-descriptions': {
      accepted: 'trajectory 作成要求を受け付けた状態',
      processing: '解析ジョブを実行中の状態',
      completed: '解析が正常完了した状態',
      failed: '解析が失敗した状態',
    },
  })

export const uploadTargetSchema = z.enum(['acce', 'gyro', 'pressure', 'wifi']).openapi({
  description: 'アップロード対象のセンサ種別',
  'x-enum-descriptions': {
    acce: '加速度センサのデータ',
    gyro: 'ジャイロセンサのデータ',
    pressure: '気圧センサのデータ',
    wifi: 'Wi-Fi スキャンデータ',
  },
})

export const uploadTargetsSchema = z
  .array(uploadTargetSchema)
  .min(2)
  .openapi({
    description: 'アップロード対象の一覧。少なくとも acce と gyro を含む',
  })
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
