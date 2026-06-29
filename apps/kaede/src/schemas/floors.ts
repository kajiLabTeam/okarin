import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const floorSchema = z.object({
  floor_id: uuidSchema.openapi({
    description: 'floor の ID',
  }),
  building_id: uuidSchema.openapi({
    description: 'floor が属する building の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'floor が属する organization の ID',
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
  map_image: z
    .object({
      download_url: z.string().url().openapi({
        description: 'floor map 画像を取得するための署名付き URL',
      }),
      download_expires_at: isoDatetimeSchema.openapi({
        description: 'download_url の有効期限',
      }),
      content_type: z.enum(['image/png', 'image/svg+xml']).openapi({
        description: 'floor map 画像の Content-Type',
      }),
      extension: z.enum(['png', 'svg']).openapi({
        description: 'floor map 画像の拡張子',
      }),
    })
    .openapi({
      description: 'floor map 画像の表示用情報',
    }),
  created_at: isoDatetimeSchema.openapi({
    description: 'floor の作成日時',
  }),
  updated_at: isoDatetimeSchema.openapi({
    description: 'floor の最終更新日時',
  }),
})

export const floorIdParamsSchema = z.object({
  floorId: uuidSchema.openapi({
    description: 'floor を一意に識別する ID',
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
  level: z.number().int().openapi({
    description: '階層',
  }),
  name: z.string().min(1).openapi({
    description: 'floor の名称',
  }),
  scale: z.number().positive().nullable().optional().openapi({
    description: '縮尺。未設定の場合は null',
  }),
})

export const createFloorMultipartRequestSchema = z.object({
  level: z.string().openapi({
    description: '階層',
  }),
  name: z.string().min(1).openapi({
    description: 'floor の名称',
  }),
  scale: z.string().optional().openapi({
    description: '縮尺。未設定の場合は null',
  }),
  map_image: z.any().openapi({
    type: 'string',
    format: 'binary',
    description: 'floor map 画像ファイル',
  }),
})

export type CreateFloorRequest = z.infer<typeof createFloorRequestSchema>
export type CreateFloorMultipartRequest = z.infer<typeof createFloorMultipartRequestSchema>
export type FloorIdParams = z.infer<typeof floorIdParamsSchema>
export type FloorResponse = z.infer<typeof floorSchema>
