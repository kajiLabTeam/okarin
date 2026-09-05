import { z } from '@hono/zod-openapi'
import { isoDatetimeSchema, uuidSchema } from './common.js'

export const ibeaconConfigSchema = z
  .object({
    uuid: uuidSchema,
    major: z.number().int().min(0).max(65535),
    minor: z.number().int().min(0).max(65535),
  })
  .strict()

export const beaconFormatTypeSchema = z.literal('ibeacon')

export const beaconSchema = z
  .object({
    beacon_id: uuidSchema,
    organization_id: uuidSchema,
    floor_id: uuidSchema,
    format_type: beaconFormatTypeSchema,
    format_config: ibeaconConfigSchema,
    name: z.string().min(1),
    pixel_x: z.number().nonnegative(),
    pixel_y: z.number().nonnegative(),
    note: z.string().nullable(),
    enabled: z.boolean(),
    deleted_at: isoDatetimeSchema.nullable(),
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
  })
  .openapi('Beacon')

export const createBeaconRequestSchema = z
  .object({
    format_type: beaconFormatTypeSchema.default('ibeacon'),
    uuid: uuidSchema,
    major: z.number().int().min(0).max(65535),
    minor: z.number().int().min(0).max(65535),
    name: z.string().trim().min(1).max(200),
    pixel_x: z.number().nonnegative(),
    pixel_y: z.number().nonnegative(),
    note: z.string().max(2000).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
  .openapi('CreateBeaconRequest')

export const updateBeaconRequestSchema = z
  .object({
    format_type: beaconFormatTypeSchema.optional(),
    uuid: uuidSchema.optional(),
    major: z.number().int().min(0).max(65535).optional(),
    minor: z.number().int().min(0).max(65535).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    pixel_x: z.number().nonnegative().optional(),
    pixel_y: z.number().nonnegative().optional(),
    note: z.string().max(2000).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'patch must not be empty' })
  })
  .openapi('UpdateBeaconRequest')

export const beaconListResponseSchema = z
  .object({
    beacons: z.array(beaconSchema),
    pagination: z.object({
      next_cursor: z.string().nullable(),
      total_count: z.number().int().nonnegative(),
    }),
  })
  .openapi('BeaconListResponse')

export const recordingBeaconConfigResponseSchema = z
  .object({
    configuration_version: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    beacons: z.array(beaconSchema),
  })
  .openapi('RecordingBeaconConfigResponse')

export const beaconParamsSchema = z.object({ organizationId: uuidSchema, beaconId: uuidSchema })
export const floorBeaconParamsSchema = z.object({ organizationId: uuidSchema, floorId: uuidSchema })
export type CreateBeaconRequest = z.infer<typeof createBeaconRequestSchema>
export type UpdateBeaconRequest = z.infer<typeof updateBeaconRequestSchema>
export type BeaconResponse = z.infer<typeof beaconSchema>
