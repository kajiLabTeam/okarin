import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  backfill: vi.fn(),
  getBytes: vi.fn(),
  stdoutWrite: vi.fn(() => true),
}))

vi.mock('../services/floors/index.js', () => ({
  listFloorMapDimensionRows: mocks.listRows,
  backfillFloorMapDimensions: mocks.backfill,
}))
vi.mock('../services/storage/index.js', () => ({
  getFloorMapExtensionFromObjectKey: (key: string) =>
    key.endsWith('.png') ? 'png' : key.endsWith('.svg') ? 'svg' : undefined,
  getFloorMapObjectBytes: mocks.getBytes,
}))

import { main, parseOptions } from './floor-map-dimension-backfill.js'

const floorId = '11111111-1111-4111-8111-111111111111'
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x02,
  0x80, 0, 0, 0x01, 0xe0,
])

describe('floor-map-dimension-backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process.stdout, 'write').mockImplementation(mocks.stdoutWrite)
    mocks.listRows.mockResolvedValue([
      {
        id: floorId,
        image_object_path: `organizations/22222222-2222-4222-8222-222222222222/floors/${floorId}/map.png`,
        map_width_px: null,
        map_height_px: null,
      },
    ])
    mocks.getBytes.mockResolvedValue(png)
    mocks.backfill.mockResolvedValue(true)
  })

  it('commandとfloor IDを解析する', () => {
    expect(parseOptions(['verify', '--floor-id', floorId])).toEqual({
      command: 'verify',
      floorId,
    })
    expect(() => parseOptions(['unknown'])).toThrow(/usage/)
  })

  it('objectから取得した寸法を未設定floorへ保存する', async () => {
    await main(['backfill'])

    expect(mocks.backfill).toHaveBeenCalledWith(floorId, 640, 480)
    expect(mocks.stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"updated":1'))
  })

  it('verifyでDB寸法とobjectが異なる場合は失敗する', async () => {
    mocks.listRows.mockResolvedValueOnce([
      {
        id: floorId,
        image_object_path: `organizations/22222222-2222-4222-8222-222222222222/floors/${floorId}/map.png`,
        map_width_px: 320,
        map_height_px: 240,
      },
    ])

    await expect(main(['verify'])).rejects.toThrow(
      'floor map dimension migration failed for 1 resource(s)'
    )
    expect(mocks.backfill).not.toHaveBeenCalled()
  })
})
