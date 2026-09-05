import { describe, expect, it } from 'vitest'
import { configurationVersion } from '../services/beacons/configuration-version.js'
import {
  createBeaconRequestSchema,
  ibeaconConfigSchema,
  recordingBeaconConfigResponseSchema,
  updateBeaconRequestSchema,
} from './beacons.js'

describe('beacon schemas', () => {
  it('POST payloadはflatなiBeacon識別値を受け付ける', () => {
    expect(
      createBeaconRequestSchema.parse({
        name: 'entrance',
        format_type: 'ibeacon',
        uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
        major: 1,
        minor: 2,
        pixel_x: 10,
        pixel_y: 20,
      })
    ).toMatchObject({ uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825', major: 1, minor: 2 })
  })

  it('POST payloadのformat_config入力は受け付けない', () => {
    expect(
      createBeaconRequestSchema.safeParse({
        name: 'entrance',
        format_type: 'ibeacon',
        format_config: { uuid: 'fda50693-a4e2-4fb1-afcf-c6eb07647825', major: 1, minor: 2 },
        pixel_x: 10,
        pixel_y: 20,
      }).success
    ).toBe(false)
  })

  it('iBeaconの範囲とrecording-configのversion形式を検証する', () => {
    expect(
      ibeaconConfigSchema.safeParse({
        uuid: 'fda50693-a4e2-4fb1-afcf-c6eb07647825',
        major: 65535,
        minor: 0,
      }).success
    ).toBe(true)
    expect(
      recordingBeaconConfigResponseSchema.safeParse({
        configuration_version: `sha256:${'a'.repeat(64)}`,
        beacons: [],
      }).success
    ).toBe(true)
  })

  it('PATCHはibeaconを許可し、空PATCHを拒否する', () => {
    expect(updateBeaconRequestSchema.safeParse({ format_type: 'ibeacon', major: 3 }).success).toBe(
      true
    )
    expect(updateBeaconRequestSchema.safeParse({}).success).toBe(false)
  })

  it('configuration_versionは有効ビーコンをID順・正規化値でhashする', () => {
    const base = {
      floor_id: '11111111-1111-4111-8111-111111111111',
      format_type: 'ibeacon',
      pixel_x: 1,
      pixel_y: 2,
      enabled: true,
      deleted_at: null as Date | null,
    }
    const first = {
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      format_config: { uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825', major: 1, minor: 2 },
    }
    const second = {
      ...base,
      id: '22222222-2222-4222-8222-222222222222',
      format_config: { uuid: 'd546df97-4757-47ef-be09-3e2dcbdd0c77', major: 3, minor: 4 },
    }
    expect(configurationVersion([first, second])).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(configurationVersion([first, second])).toBe(configurationVersion([second, first]))
  })
})
