import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const pedestrianSchema = z.object({
  pedestrian_id: uuidSchema.openapi({
    description: 'pedestrian の ID',
  }),
  height: z.number().nullable().openapi({
    description: '身長。未設定の場合は null',
  }),
  stride_length: z.number().nullable().openapi({
    description: '歩幅。未設定の場合は null',
  }),
  attributes: z.record(z.string(), z.unknown()).openapi({
    description: 'pedestrian に紐づく任意属性',
  }),
  created_at: isoDatetimeSchema.openapi({
    description: 'pedestrian の作成日時',
  }),
  updated_at: isoDatetimeSchema.openapi({
    description: 'pedestrian の最終更新日時',
  }),
})

export const pedestriansListResponseSchema = z.object({
  pedestrians: z.array(pedestrianSchema).openapi({
    description: '計測対象として選択可能な pedestrian 一覧',
  }),
})
