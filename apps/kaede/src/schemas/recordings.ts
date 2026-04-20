import { z } from '@hono/zod-openapi'

import {
  isoDatetimeSchema,
  recordingUploadStatusSchema,
  uploadTargetsSchema,
  uuidSchema,
} from './common.js'

const uploadUrlsSchema = z.object({
  acce: z.string().url().optional(),
  gyro: z.string().url().optional(),
  pressure: z.string().url().optional(),
  wifi: z.string().url().optional(),
})

export const recordingIdParamsSchema = z.object({
  recordingId: uuidSchema,
})

export const initRecordingRequestSchema = z.object({
  pedestrian_id: uuidSchema,
  floor_id: uuidSchema,
  upload_targets: uploadTargetsSchema,
})

export const initRecordingResponseSchema = z.object({
  recording_id: uuidSchema,
  upload_status: recordingUploadStatusSchema,
  upload_urls: uploadUrlsSchema,
  expires_at: isoDatetimeSchema,
})

export const completeUploadResponseSchema = z.object({
  recording_id: uuidSchema,
  upload_status: recordingUploadStatusSchema,
})

export const refreshUploadUrlsRequestSchema = z.object({
  targets: z.array(z.enum(['acce', 'gyro', 'pressure', 'wifi'])).min(1),
})

export const refreshUploadUrlsResponseSchema = z.object({
  recording_id: uuidSchema,
  upload_status: recordingUploadStatusSchema,
  upload_urls: uploadUrlsSchema,
  expires_at: isoDatetimeSchema,
})

export const recordingDetailResponseSchema = z.object({
  recording_id: uuidSchema,
  pedestrian_id: uuidSchema,
  floor_id: uuidSchema,
  upload_status: recordingUploadStatusSchema,
  upload_targets: uploadTargetsSchema,
  created_at: isoDatetimeSchema,
  updated_at: isoDatetimeSchema,
})

export const recordingTrajectoriesResponseSchema = z.object({
  recording_id: uuidSchema,
  trajectories: z.array(
    z.object({
      trajectory_id: uuidSchema,
      status: z.enum(['accepted', 'processing', 'completed', 'failed']),
      created_at: isoDatetimeSchema,
    })
  ),
})

export type InitRecordingRequest = z.infer<typeof initRecordingRequestSchema>
export type RecordingIdParams = z.infer<typeof recordingIdParamsSchema>
