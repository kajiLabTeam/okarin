import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFloorResources } from './pipeline-resource-resolver.js'
import type { PipelineResourceAsset } from './pipeline-resource-resolver.js'

const { findFloor, getMap, getObject, listBeacons, putLayout } = vi.hoisted(() => ({
  findFloor: vi.fn(),
  getMap: vi.fn(),
  getObject: vi.fn(),
  listBeacons: vi.fn(),
  putLayout: vi.fn(),
}))

vi.mock('../floors/index.js', () => ({ findFloorDetailById: findFloor }))
vi.mock('../beacons/index.js', async () => {
  const { beaconLayout } = await import('../beacons/configuration-version.js')
  return { beaconLayout, listBeacons }
})
vi.mock('../storage/index.js', () => ({
  getFloorMapObjectBytes: getMap,
  getObjectBytes: getObject,
  putBeaconLayoutObject: putLayout,
}))

const recording = { floor_id: 'floor-1', organization_id: 'org-1' }
const metadata: PipelineResourceAsset = {
  data_asset_id: 'metadata-1',
  data_type: 'metadata',
  schema_version: '1',
  format: 'json',
  validation_status: 'valid',
  object_key: 'recording/metadata.json',
}
const recordedBeacons = [
  { beacon_id: 'beacon-3', floor_id: 'floor-1', pixel_x: 300, pixel_y: 30, enabled: true },
  { beacon_id: 'beacon-1', floor_id: 'floor-1', pixel_x: 100, pixel_y: 10, enabled: true },
  { beacon_id: 'beacon-2', floor_id: 'floor-1', pixel_x: 200, pixel_y: 20, enabled: true },
]
const loadMetadata = (document: unknown) =>
  getObject.mockResolvedValue(new TextEncoder().encode(JSON.stringify(document)))
const storedLayout = () =>
  JSON.parse(new TextDecoder().decode(putLayout.mock.calls.at(-1)?.[1] as Uint8Array))
const layoutAsset = (assets: PipelineResourceAsset[]) =>
  assets.find((asset) => asset.data_type === 'resource.beacon_layout')

describe('recorded beacon layout resources', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    findFloor.mockResolvedValue({ floor_id: 'floor-1', image_object_path: 'floor/map.png' })
    getMap.mockResolvedValue(new Uint8Array([1, 2, 3]))
    listBeacons.mockResolvedValue([
      {
        id: 'beacon-1',
        pixel_x: 999,
        pixel_y: 888,
        enabled: true,
        deleted_at: null,
      },
    ])
  })

  it('現在の無効化・移動・削除に影響されず計測時の3台を実行用配置へ保存する', async () => {
    loadMetadata({ floor_id: 'floor-1', ble: { configuration: { beacons: recordedBeacons } } })
    const first = await resolveFloorResources(recording, [metadata])
    expect(storedLayout()).toEqual({
      beacons: [
        { beacon_id: 'beacon-1', pixel_x: 100, pixel_y: 10 },
        { beacon_id: 'beacon-2', pixel_x: 200, pixel_y: 20 },
        { beacon_id: 'beacon-3', pixel_x: 300, pixel_y: 30 },
      ],
    })
    listBeacons.mockResolvedValue([])
    const second = await resolveFloorResources(recording, [metadata])
    expect(layoutAsset(second)).toEqual(layoutAsset(first))
    expect(listBeacons).not.toHaveBeenCalled()
    expect(getObject).toHaveBeenCalledWith('recording/metadata.json')
    expect(layoutAsset(first)).toMatchObject({
      validation_status: 'valid',
      checksum_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('計測時に無効だったビーコンを現在の設定で有効化しない', async () => {
    loadMetadata({
      ble: {
        configuration: { beacons: [recordedBeacons[0], { ...recordedBeacons[1], enabled: false }] },
      },
    })
    await resolveFloorResources(recording, [metadata])
    expect(storedLayout()).toEqual({
      beacons: [{ beacon_id: 'beacon-3', pixel_x: 300, pixel_y: 30 }],
    })
    expect(listBeacons).not.toHaveBeenCalled()
  })

  it.each([{}, { ble: {} }])('配置のない旧metadataだけ現在のDBを利用する: %j', async (document) => {
    loadMetadata(document)
    await resolveFloorResources(recording, [metadata])
    expect(listBeacons).toHaveBeenCalledWith('floor-1')
    expect(storedLayout()).toEqual({
      beacons: [{ beacon_id: 'beacon-1', pixel_x: 999, pixel_y: 888 }],
    })
  })

  it('metadata自体がない旧計測の互換性を維持する', async () => {
    await resolveFloorResources(recording)
    expect(getObject).not.toHaveBeenCalled()
    expect(listBeacons).toHaveBeenCalledWith('floor-1')
    expect(layoutAsset(await resolveFloorResources(recording))).toBeDefined()
  })

  it.each([
    { beacons: [] },
    { beacons: [{ ...recordedBeacons[0], enabled: false }] },
    null,
    {},
    { beacons: 'invalid' },
    { beacons: [{ ...recordedBeacons[0], pixel_x: '300' }] },
    { beacons: [{ ...recordedBeacons[0], pixel_y: -1 }] },
    { beacons: [{ ...recordedBeacons[0], floor_id: 'other-floor' }] },
    { beacons: [recordedBeacons[0], recordedBeacons[0]] },
  ])('空・不正な配置を現在のDBで置換しない: %j', async (configuration) => {
    loadMetadata({ ble: { configuration } })
    const assets = await resolveFloorResources(recording, [metadata])
    expect(layoutAsset(assets)).toBeUndefined()
    expect(assets).toContainEqual(expect.objectContaining({ data_type: 'resource.floor_map' }))
    expect(listBeacons).not.toHaveBeenCalled()
    expect(putLayout).not.toHaveBeenCalled()
  })

  it.each([null, [], { floor_id: 'other-floor' }, { ble: null }])(
    '不正・別フロアのmetadataから現在の配置へフォールバックしない: %j',
    async (document) => {
      loadMetadata(document)
      expect(layoutAsset(await resolveFloorResources(recording, [metadata]))).toBeUndefined()
      expect(listBeacons).not.toHaveBeenCalled()
    }
  )

  it('壊れたJSONから現在の配置へフォールバックしない', async () => {
    getObject.mockResolvedValue(new TextEncoder().encode('{broken'))
    expect(layoutAsset(await resolveFloorResources(recording, [metadata]))).toBeUndefined()
    expect(listBeacons).not.toHaveBeenCalled()
  })

  it('metadataの読み込み障害を現在の配置で隠さない', async () => {
    getObject.mockRejectedValue(new Error('storage unavailable'))
    await expect(resolveFloorResources(recording, [metadata])).rejects.toThrow(
      'storage unavailable'
    )
    expect(listBeacons).not.toHaveBeenCalled()
  })

  it.each([
    [metadata, { ...metadata, data_asset_id: 'metadata-2', object_key: 'second.json' }],
    [{ ...metadata, validation_status: 'invalid' }],
    [{ ...metadata, object_key: undefined }],
  ])('一意で有効なmetadataを選べないときは現在の配置へ戻らない', async (...assets) => {
    expect(layoutAsset(await resolveFloorResources(recording, assets))).toBeUndefined()
    expect(listBeacons).not.toHaveBeenCalled()
    expect(getObject).not.toHaveBeenCalled()
  })
})
