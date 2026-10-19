import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'

const { findBeaconMock, findFloorByIdMock, updateBeaconMock } = vi.hoisted(() => ({
  findBeaconMock: vi.fn(),
  findFloorByIdMock: vi.fn(),
  updateBeaconMock: vi.fn(),
}))

vi.mock('../../services/beacons/index.js', () => ({
  configurationVersion: vi.fn(),
  countBeacons: vi.fn(),
  findBeacon: findBeaconMock,
  insertBeaconWithFloorLock: vi.fn(),
  listBeacons: vi.fn(),
  softDeleteBeacon: vi.fn(),
  updateBeacon: updateBeaconMock,
}))

vi.mock('../../services/floors/index.js', () => ({ findFloorById: findFloorByIdMock }))

import { updateOrganizationBeacon } from './index.js'

const organizationId = '11111111-1111-4111-8111-111111111111'
const beaconId = '22222222-2222-4222-8222-222222222222'
const floorId = '33333333-3333-4333-8333-333333333333'
const actor: RequestActor = {
  type: 'user',
  user_id: '44444444-4444-4444-8444-444444444444',
  email: 'manager@example.test',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Test', role: 'manager' }],
}

const beacon = {
  id: beaconId,
  organization_id: organizationId,
  floor_id: floorId,
  format_type: 'ibeacon',
  format_config: {
    uuid: 'fda50693-a4e2-4fb1-afcf-c6eb07647825',
    major: 1,
    minor: 2,
    mac_address: 'aa:bb:cc:dd:ee:ff',
  },
  name: 'Entrance',
  pixel_x: 10,
  pixel_y: 20,
  note: null,
  enabled: true,
  deleted_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
}

describe('updateOrganizationBeacon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findBeaconMock.mockResolvedValue(beacon)
    findFloorByIdMock.mockResolvedValue({
      id: floorId,
      organization_id: organizationId,
      map_width_px: 100,
      map_height_px: 100,
    })
    updateBeaconMock.mockImplementation((_orgId, _beaconId, patch) => ({
      ...beacon,
      ...patch,
    }))
  })

  it('mac_address:nullで保存済みMACをformat_configから削除する', async () => {
    const result = await updateOrganizationBeacon(actor, organizationId, beaconId, {
      mac_address: null,
    })

    expect(updateBeaconMock).toHaveBeenCalledWith(organizationId, beaconId, {
      format_config: {
        uuid: beacon.format_config.uuid,
        major: beacon.format_config.major,
        minor: beacon.format_config.minor,
      },
      pixel_x: beacon.pixel_x,
      pixel_y: beacon.pixel_y,
    })
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({
      ok: true,
      value: { format_config: { uuid: beacon.format_config.uuid } },
    })
    expect(result).not.toMatchObject({
      value: { format_config: { mac_address: expect.anything() } },
    })
  })
})
