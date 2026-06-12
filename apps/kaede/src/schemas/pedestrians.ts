import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
type JsonPrimitive = z.infer<typeof jsonPrimitiveSchema>
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined }
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)])
)
const jsonObjectSchema = z.record(jsonValueSchema)

export const pedestrianSchema = z.object({
  pedestrian_id: uuidSchema.openapi({
    description: 'pedestrian の ID',
  }),
  organization_id: uuidSchema.openapi({
    description: 'pedestrian が属する organization の ID',
  }),
  display_name: z.string().min(1).openapi({
    description: 'pedestrian を画面上で識別する表示名',
  }),
  height: z.number().nullable().openapi({
    description: '身長。未設定の場合は null',
  }),
  stride_length: z.number().nullable().openapi({
    description: '歩幅。未設定の場合は null',
  }),
  attributes: jsonObjectSchema.openapi({
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

export const createPedestrianWithoutOrganizationRequestSchema = z.object({
  display_name: z.string().min(1).openapi({
    description: 'pedestrian を画面上で識別する表示名',
  }),
  height: z.number().positive().nullable().optional().openapi({
    description: '身長。未設定の場合は null',
  }),
  stride_length: z.number().positive().nullable().optional().openapi({
    description: '歩幅。未設定の場合は null',
  }),
  attributes: jsonObjectSchema.optional().openapi({
    description: 'pedestrian に紐づく任意属性',
  }),
})

export const createPedestrianRequestSchema =
  createPedestrianWithoutOrganizationRequestSchema.extend({
    organization_id: uuidSchema.openapi({
      description: 'pedestrian を所属させる organization の ID',
    }),
  })

export type PedestriansListResponse = z.infer<typeof pedestriansListResponseSchema>
export type CreatePedestrianRequest = z.infer<typeof createPedestrianRequestSchema>
export type CreatePedestrianWithoutOrganizationRequest = z.infer<
  typeof createPedestrianWithoutOrganizationRequestSchema
>
export type PedestrianResponse = z.infer<typeof pedestrianSchema>
