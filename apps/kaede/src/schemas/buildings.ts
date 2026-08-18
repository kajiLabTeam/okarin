import { z } from '@hono/zod-openapi'

import { isoDatetimeSchema, uuidSchema } from './common.js'

export const buildingSchema = z
  .object({
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
  .openapi('Building')

export const buildingIdParamsSchema = z
  .object({
    buildingId: uuidSchema.openapi({
      description: 'building を一意に識別する ID',
    }),
  })
  .openapi('BuildingIdParams')

export const organizationBuildingIdParamsSchema = z
  .object({
    organizationId: uuidSchema.openapi({
      description: 'organization を一意に識別する ID',
    }),
    buildingId: uuidSchema.openapi({
      description: 'building を一意に識別する ID',
    }),
  })
  .openapi('OrganizationBuildingIdParams')

export const buildingsListResponseSchema = z
  .object({
    buildings: z.array(buildingSchema).openapi({
      description: 'building 一覧',
    }),
  })
  .openapi('BuildingsListResponse')

export const organizationBuildingListItemSchema = buildingSchema
  .extend({
    floor_count: z.number().int().nonnegative().openapi({
      description: 'building に登録されている floor の件数',
    }),
    recording_count: z.number().int().nonnegative().openapi({
      description: 'building に登録されている有効な recording の件数',
    }),
  })
  .openapi('OrganizationBuildingListItem')

export const organizationBuildingsListResponseSchema = z
  .object({
    buildings: z.array(organizationBuildingListItemSchema).openapi({
      description: 'organization 内 building 一覧',
    }),
  })
  .openapi('OrganizationBuildingsListResponse')

export const buildingDetailSummarySchema = z
  .object({
    floor_count: z.number().int().nonnegative().openapi({
      description: 'building に登録されている floor の件数',
    }),
    recording_count: z.number().int().nonnegative().openapi({
      description: 'building に登録されている有効な recording の件数',
    }),
  })
  .openapi('BuildingDetailSummary')

export const buildingDetailFloorSchema = z
  .object({
    floor_id: uuidSchema.openapi({
      description: 'floor の ID',
    }),
    building_id: uuidSchema.openapi({
      description: 'floor が属する building の ID',
    }),
    organization_id: uuidSchema.openapi({
      description: 'floor が属する organization の ID',
    }),
    name: z.string().min(1).openapi({
      description: 'floor の名称',
    }),
    level: z.number().int().openapi({
      description: '階層',
    }),
    recording_count: z.number().int().nonnegative().openapi({
      description: 'floor に登録されている有効な recording の件数',
    }),
    map_image: z
      .object({
        download_url: z.string().url(),
        download_expires_at: isoDatetimeSchema,
        content_type: z.enum(['image/png', 'image/svg+xml']),
        extension: z.enum(['png', 'svg']),
      })
      .openapi({
        description: 'floor map 画像の表示用情報',
      }),
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
  })
  .openapi('BuildingDetailFloor')

export const buildingDetailResponseSchema = z
  .object({
    building: buildingSchema,
    summary: buildingDetailSummarySchema,
    floors: z.array(buildingDetailFloorSchema).openapi({
      description: 'building に紐づく floor 一覧',
    }),
  })
  .openapi('BuildingDetailResponse')

export const createBuildingRequestSchema = z
  .object({
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
  .openapi('CreateBuildingRequest')

export type BuildingIdParams = z.infer<typeof buildingIdParamsSchema>
export type BuildingResponse = z.infer<typeof buildingSchema>
export type OrganizationBuildingListItemResponse = z.infer<
  typeof organizationBuildingListItemSchema
>
export type BuildingDetailResponse = z.infer<typeof buildingDetailResponseSchema>
export type CreateBuildingRequest = z.infer<typeof createBuildingRequestSchema>
