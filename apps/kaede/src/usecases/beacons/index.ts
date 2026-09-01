import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  BeaconResponse,
  CreateBeaconRequest,
  UpdateBeaconRequest,
} from '../../schemas/beacons.js'
import { ibeaconConfigSchema } from '../../schemas/beacons.js'
import type { PaginationQuery } from '../../schemas/pagination.js'
import { buildPaginatedResult, decodePaginationCursor } from '../../schemas/pagination.js'
import {
  configurationVersion,
  countBeacons,
  findBeacon,
  insertBeaconWithFloorLock,
  listBeacons,
  softDeleteBeacon,
  updateBeacon,
} from '../../services/beacons/index.js'
import type { Beacon } from '../../services/beacons/index.js'
import { findFloorById } from '../../services/floors/index.js'
import {
  requireDashboardWriteAccess,
  requireOrganizationManager,
  requireOrganizationMember,
} from '../authorization.js'

const response = (beacon: Beacon): BeaconResponse => ({
  beacon_id: beacon.id,
  organization_id: beacon.organization_id,
  floor_id: beacon.floor_id,
  format_type: 'ibeacon',
  format_config: ibeaconConfigSchema.parse(beacon.format_config),
  name: beacon.name,
  pixel_x: beacon.pixel_x,
  pixel_y: beacon.pixel_y,
  note: beacon.note,
  enabled: beacon.enabled,
  deleted_at: beacon.deleted_at?.toISOString() ?? null,
  created_at: beacon.created_at.toISOString(),
  updated_at: beacon.updated_at.toISOString(),
})

const checkCoordinates = (floor: Awaited<ReturnType<typeof findFloorById>>, x: number, y: number) =>
  floor?.map_width_px !== undefined &&
  floor.map_width_px !== null &&
  floor.map_height_px !== null &&
  x < floor.map_width_px &&
  y < floor.map_height_px

const getFloor = async (organizationId: string, floorId: string) => {
  const floor = await findFloorById(floorId)
  return floor?.organization_id === organizationId ? floor : undefined
}

export const listOrganizationBeacons = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string,
  includeDisabled: boolean,
  pagination: PaginationQuery
) => {
  const auth = requireOrganizationMember(actor, organizationId)
  if (!auth.ok) return { ok: false, error: auth.error } as const
  if (includeDisabled) {
    const managementAuth = requireOrganizationManager(actor, organizationId)
    if (!managementAuth.ok) return { ok: false, error: managementAuth.error } as const
  }
  if (!(await getFloor(organizationId, floorId)))
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } as const }
  const cursor = pagination.cursor
    ? decodePaginationCursor(pagination.cursor)
    : { ok: true as const, value: null }
  if (!cursor.ok) return { ok: false, error: { type: 'PAGINATION_CURSOR_INVALID' as const } }
  const [rows, totalCount] = await Promise.all([
    listBeacons(floorId, includeDisabled, { limit: pagination.limit, cursor: cursor.value }),
    countBeacons(floorId, includeDisabled),
  ])
  const result = buildPaginatedResult(
    rows.map((row) => ({ ...row, cursor_created_at: row.created_at.toISOString() })),
    pagination.limit,
    totalCount
  )
  return {
    ok: true,
    value: {
      beacons: result.items.map(response),
      pagination: { next_cursor: result.nextCursor, total_count: result.totalCount },
    },
  } as const
}

export const getRecordingBeaconConfig = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string
) => {
  const auth = requireOrganizationMember(actor, organizationId)
  if (!auth.ok) return { ok: false, error: auth.error } as const
  if (!(await getFloor(organizationId, floorId)))
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } as const }
  const rows = await listBeacons(floorId, false)
  return {
    ok: true,
    value: { configuration_version: configurationVersion(rows), beacons: rows.map(response) },
  } as const
}

export const createOrganizationBeacon = async (
  actor: RequestActor,
  organizationId: string,
  floorId: string,
  payload: CreateBeaconRequest
) => {
  const auth = requireDashboardWriteAccess(actor, organizationId)
  if (!auth.ok) return { ok: false, error: auth.error } as const
  const floor = await getFloor(organizationId, floorId)
  if (!floor) return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId } as const }
  if (!checkCoordinates(floor, payload.pixel_x, payload.pixel_y))
    return { ok: false, error: { type: 'BEACON_COORDINATES_INVALID', floorId } as const }
  const config = ibeaconConfigSchema.safeParse({
    uuid: payload.uuid.toLowerCase(),
    major: payload.major,
    minor: payload.minor,
  })
  if (!config.success) return { ok: false, error: { type: 'BEACON_FORMAT_INVALID' } as const }
  try {
    const beacon = await insertBeaconWithFloorLock({
      organization_id: organizationId,
      floor_id: floorId,
      format_type: 'ibeacon',
      format_config: config.data,
      name: payload.name,
      pixel_x: payload.pixel_x,
      pixel_y: payload.pixel_y,
      note: payload.note ?? null,
      enabled: payload.enabled,
      deleted_at: null,
    })
    if (!beacon)
      return { ok: false, error: { type: 'BEACON_LIMIT_REACHED', floorId, limit: 1000 } as const }
    return { ok: true, value: response(beacon) } as const
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      return { ok: false, error: { type: 'BEACON_CONFLICT' } as const }
    throw error
  }
}

export const updateOrganizationBeacon = async (
  actor: RequestActor,
  organizationId: string,
  beaconId: string,
  payload: UpdateBeaconRequest
) => {
  const auth = requireDashboardWriteAccess(actor, organizationId)
  if (!auth.ok) return { ok: false, error: auth.error } as const
  const current = await findBeacon(organizationId, beaconId)
  if (!current) return { ok: false, error: { type: 'BEACON_NOT_FOUND', beaconId } as const }
  const floor = await getFloor(organizationId, current.floor_id)
  if (!floor)
    return { ok: false, error: { type: 'FLOOR_NOT_FOUND', floorId: current.floor_id } as const }
  const x = payload.pixel_x ?? current.pixel_x
  const y = payload.pixel_y ?? current.pixel_y
  if (!checkCoordinates(floor, x, y))
    return {
      ok: false,
      error: { type: 'BEACON_COORDINATES_INVALID', floorId: current.floor_id } as const,
    }
  const config =
    payload.uuid !== undefined || payload.major !== undefined || payload.minor !== undefined
      ? ibeaconConfigSchema.safeParse({
          uuid: (
            payload.uuid ?? ibeaconConfigSchema.parse(current.format_config).uuid
          ).toLowerCase(),
          major: payload.major ?? ibeaconConfigSchema.parse(current.format_config).major,
          minor: payload.minor ?? ibeaconConfigSchema.parse(current.format_config).minor,
        })
      : undefined
  if (config && !config.success)
    return { ok: false, error: { type: 'BEACON_FORMAT_INVALID' } as const }
  try {
    const beacon = await updateBeacon(organizationId, beaconId, {
      ...(payload.name === undefined ? {} : { name: payload.name }),
      ...(config ? { format_config: config.data } : {}),
      pixel_x: x,
      pixel_y: y,
      ...(payload.note === undefined ? {} : { note: payload.note }),
      ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
    })
    return beacon
      ? ({ ok: true, value: response(beacon) } as const)
      : { ok: false, error: { type: 'BEACON_NOT_FOUND', beaconId } as const }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      return { ok: false, error: { type: 'BEACON_CONFLICT' } as const }
    throw error
  }
}

export const deleteOrganizationBeacon = async (
  actor: RequestActor,
  organizationId: string,
  beaconId: string
) => {
  const auth = requireDashboardWriteAccess(actor, organizationId)
  if (!auth.ok) return { ok: false, error: auth.error } as const
  const beacon = await softDeleteBeacon(organizationId, beaconId)
  return beacon
    ? ({ ok: true, value: response(beacon) } as const)
    : { ok: false, error: { type: 'BEACON_NOT_FOUND', beaconId } as const }
}
