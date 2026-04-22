import { z } from '@hono/zod-openapi'

import {
  isoDatetimeSchema,
  recordingUploadStatusSchema,
  trajectoryStatusSchema,
  uploadTargetSchema,
  uploadTargetsSchema,
  uuidSchema,
} from './common.js'

const uploadUrlsSchema = z.object({
  acce: z.string().url().optional().openapi({ description: '加速度センサ用のアップロード URL' }),
  gyro: z.string().url().optional().openapi({ description: 'ジャイロセンサ用のアップロード URL' }),
  pressure: z.string().url().optional().openapi({ description: '気圧センサ用のアップロード URL' }),
  wifi: z.string().url().optional().openapi({ description: 'Wi-Fi スキャン用のアップロード URL' }),
})

export const recordingIdParamsSchema = z.object({
  recordingId: uuidSchema.openapi({
    description: 'recording を一意に識別する ID',
  }),
})

export const initRecordingRequestSchema = z.object({
  pedestrian_id: uuidSchema.openapi({
    description: '計測対象 pedestrian の ID',
  }),
  floor_id: uuidSchema.openapi({
    description: '計測対象 floor の ID',
  }),
  upload_targets: uploadTargetsSchema.openapi({
    description: '初回アップロードで要求するセンサデータの一覧',
  }),
})

export const initRecordingResponseSchema = z.object({
  recording_id: uuidSchema.openapi({
    description: '作成された recording の ID',
  }),
  upload_status: recordingUploadStatusSchema,
  upload_urls: uploadUrlsSchema.openapi({
    description: '各アップロード対象に対応する署名付き URL',
  }),
  expires_at: isoDatetimeSchema.openapi({
    description: 'アップロード URL の有効期限',
  }),
})

export const completeUploadResponseSchema = z.object({
  recording_id: uuidSchema.openapi({
    description: 'アップロード完了を反映した recording の ID',
  }),
  upload_status: recordingUploadStatusSchema,
})

export const refreshUploadUrlsRequestSchema = z.object({
  targets: z.array(uploadTargetSchema).min(1).openapi({
    description: '再発行したいアップロード URL の対象一覧',
  }),
})

export const refreshUploadUrlsResponseSchema = z.object({
  recording_id: uuidSchema.openapi({
    description: 'アップロード URL を再発行した recording の ID',
  }),
  upload_status: recordingUploadStatusSchema,
  upload_urls: uploadUrlsSchema.openapi({
    description: '再発行されたアップロード URL',
  }),
  expires_at: isoDatetimeSchema.openapi({
    description: '再発行したアップロード URL の有効期限',
  }),
})

export const recordingDetailResponseSchema = z.object({
  recording_id: uuidSchema.openapi({
    description: 'recording の ID',
  }),
  pedestrian_id: uuidSchema.openapi({
    description: '紐づく pedestrian の ID',
  }),
  floor_id: uuidSchema.openapi({
    description: '紐づく floor の ID',
  }),
  upload_status: recordingUploadStatusSchema,
  upload_targets: uploadTargetsSchema,
  created_at: isoDatetimeSchema.openapi({
    description: 'recording の作成日時',
  }),
  updated_at: isoDatetimeSchema.openapi({
    description: 'recording の最終更新日時',
  }),
})

export const recordingTrajectoriesResponseSchema = z.object({
  recording_id: uuidSchema.openapi({
    description: '対象 recording の ID',
  }),
  trajectories: z
    .array(
      z.object({
        trajectory_id: uuidSchema.openapi({
          description: 'trajectory の ID',
        }),
        status: trajectoryStatusSchema,
        created_at: isoDatetimeSchema.openapi({
          description: 'trajectory の作成日時',
        }),
      })
    )
    .openapi({
      description: 'recording に紐づく trajectory の一覧',
    }),
})

export type InitRecordingRequest = z.infer<typeof initRecordingRequestSchema>
export type RecordingIdParams = z.infer<typeof recordingIdParamsSchema>
