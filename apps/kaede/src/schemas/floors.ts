import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const floorSchema = z.object({
  floor_id: uuidSchema.openapi({
    description: 'floor の ID',
  }),
  building_id: uuidSchema.openapi({
    description: 'floor が属する building の ID',
  }),
  building_name: z.string().min(1).openapi({
    description: 'floor が属する building の名称',
  }),
  level: z.number().int().openapi({
    description: '階層',
  }),
  name: z.string().min(1).openapi({
    description: 'floor の名称',
  }),
  scale: z.number().nullable().openapi({
    description: '縮尺。未設定の場合は null',
  }),
  created_at: isoDatetimeSchema.openapi({
    description: 'floor の作成日時',
  }),
  updated_at: isoDatetimeSchema.openapi({
    description: 'floor の最終更新日時',
  }),
})

export const floorsListResponseSchema = z.object({
  floors: z.array(floorSchema).openapi({
    description: '計測場所として選択可能な floor 一覧',
  }),
})

export const mapImageExtensionSchema = z.enum(['svg', 'png']).openapi({
  description: 'floor map 画像の拡張子',
})

export const createFloorRequestSchema = z.object({
  building_id: uuidSchema.openapi({
    description: 'floor を紐づける building の ID',
  }),
  level: z.number().int().openapi({
    description: '階層',
  }),
  name: z.string().min(1).openapi({
    description: 'floor の名称',
  }),
  scale: z.number().positive().nullable().optional().openapi({
    description: '縮尺。未設定の場合は null',
  }),
  map_image_extension: mapImageExtensionSchema.optional().openapi({
    description: 'floor map 画像の拡張子。未指定時は png',
  }),
})

export type CreateFloorRequest = z.infer<typeof createFloorRequestSchema>
export type FloorResponse = z.infer<typeof floorSchema>
