import { z } from '@hono/zod-openapi'

import { createErrorResponseSchema, isoDatetimeSchema, uuidSchema } from './common.js'

export const buildingNotFoundErrorCodes = ['BUILDING_NOT_FOUND'] as const
export type BuildingNotFoundErrorCode = (typeof buildingNotFoundErrorCodes)[number]
export const buildingNotFoundErrorResponseSchema = createErrorResponseSchema(
  'BuildingNotFoundErrorResponse',
  buildingNotFoundErrorCodes
)

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
export type CreateBuildingRequest = z.infer<typeof createBuildingRequestSchema>
