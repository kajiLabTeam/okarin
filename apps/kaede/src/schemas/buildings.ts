import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const buildingSchema = z.object({
  building_id: uuidSchema.openapi({
    description: 'building の ID',
  }),
  name: z.string().min(1).openapi({
    description: 'building の名称',
  }),
  latitude: z.number().nullable().openapi({
    description: '緯度。未設定の場合は null',
  }),
  longitude: z.number().nullable().openapi({
    description: '経度。未設定の場合は null',
  }),
  created_at: isoDatetimeSchema.openapi({
    description: 'building の作成日時',
  }),
  updated_at: isoDatetimeSchema.openapi({
    description: 'building の最終更新日時',
  }),
})

export const createBuildingRequestSchema = z.object({
  name: z.string().min(1).openapi({
    description: 'building の名称',
  }),
  latitude: z.number().min(-90).max(90).nullable().optional().openapi({
    description: '緯度。未設定の場合は null',
  }),
  longitude: z.number().min(-180).max(180).nullable().optional().openapi({
    description: '経度。未設定の場合は null',
  }),
})

export type BuildingResponse = z.infer<typeof buildingSchema>
export type CreateBuildingRequest = z.infer<typeof createBuildingRequestSchema>
