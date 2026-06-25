import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const buildingSchema = z.object({
  building_id: uuidSchema.openapi({
    description: 'building の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'building が属する organization の ID',
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

export const buildingIdParamsSchema = z.object({
  buildingId: uuidSchema.openapi({
    description: 'building を一意に識別する ID',
  }),
})

export const buildingsListResponseSchema = z.object({
  buildings: z.array(buildingSchema).openapi({
    description: 'building 一覧',
  }),
})

export const createBuildingRequestSchema = z.object({
  organization_id: uuidSchema.openapi({
    description: 'building を所属させる organization の ID',
  }),
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

export type BuildingIdParams = z.infer<typeof buildingIdParamsSchema>
export type BuildingResponse = z.infer<typeof buildingSchema>
export type CreateBuildingRequest = z.infer<typeof createBuildingRequestSchema>
