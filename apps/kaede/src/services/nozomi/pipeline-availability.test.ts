import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetContract, Pipeline } from '../../schemas/pipelines.js'
import type { PipelineResourceProvider } from './pipeline-availability.js'
import {
  listPipelineAvailability,
  recordingAssetProvider,
  resolvePipelineForExecution,
} from './pipeline-availability.js'

const {
  findFloorMock,
  findRecordingMock,
  beaconLayoutMock,
  getCatalogMock,
  getFloorMapBytesMock,
  listBeaconsMock,
  listRecordingAssetsMock,
  putBeaconLayoutMock,
  resolvePipelineMock,
} = vi.hoisted(() => ({
  findFloorMock: vi.fn(),
  findRecordingMock: vi.fn(),
  beaconLayoutMock: vi.fn((beacons: { id: string; pixel_x: number; pixel_y: number }[]) =>
    JSON.stringify({
      beacons: beacons
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((beacon) => ({
          beacon_id: beacon.id,
          pixel_x: beacon.pixel_x,
          pixel_y: beacon.pixel_y,
        })),
    })
  ),
  getFloorMapBytesMock: vi.fn(),
  getCatalogMock: vi.fn(),
  listBeaconsMock: vi.fn(),
  listRecordingAssetsMock: vi.fn(),
  putBeaconLayoutMock: vi.fn(),
  resolvePipelineMock: vi.fn(),
}))

vi.mock('./pipeline-catalog-cache.js', () => ({
  getCachedPipelineCatalog: getCatalogMock,
}))
vi.mock('./pipeline-client.js', () => ({
  resolveActivePipeline: resolvePipelineMock,
}))
vi.mock('../data-assets/index.js', () => ({
  listRecordingDataAssets: listRecordingAssetsMock,
}))
vi.mock('../floors/index.js', () => ({ findFloorDetailById: findFloorMock }))
vi.mock('../recordings/index.js', () => ({ findRecordingById: findRecordingMock }))
vi.mock('../beacons/index.js', () => ({
  beaconLayout: beaconLayoutMock,
  listBeacons: listBeaconsMock,
}))
vi.mock('../storage/index.js', () => ({
  buildRecordingRawObjectKey: (organizationId: string, recordingId: string, target: string) =>
    `organizations/${organizationId}/recordings/${recordingId}/raw/${target}.csv`,
  getFloorMapObjectBytes: getFloorMapBytesMock,
  putBeaconLayoutObject: putBeaconLayoutMock,
}))

const assetContract = (dataType: AssetContract['data_type'], format = 'csv') => ({
  kind: 'asset' as const,
  data_type: dataType,
  schema_version: '1',
  format,
})

const pipeline = (available = true): Pipeline => ({
  definition: {
    pipeline_id: 'pdr-particle-filter',
    display_name: 'PDR + Particle Filter',
    definition_version: '1.0.0',
    state: 'active',
    components: [
      {
        component_id: 'pdr',
        instance_id: 'pdr-1',
        input_slots: [],
        output_slots: [
          {
            slot_id: 'pose',
            required: true,
            max_assets: 1,
            accepted_contracts: [{ kind: 'internal_value', value_type: 'pose' }],
          },
        ],
        parameters_schema: { type: 'object' },
      },
    ],
    outputs: [
      {
        output_slot_id: 'pose',
        source_component_instance: 'pdr-1',
        source_slot_id: 'pose',
      },
    ],
    bindings: [],
    parameters_schema: { type: 'object' },
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [assetContract('acce')],
      },
      {
        slot_id: 'floor_map',
        required: true,
        max_assets: 1,
        accepted_contracts: [assetContract('resource.floor_map', 'png')],
      },
    ],
  },
  availability: available
    ? { available: true, reason: null }
    : {
        available: false,
        reason: { code: 'unsupported_component', target: 'particle-filter' },
      },
  digest: 'd'.repeat(64),
})

const pdrPipeline = (): Pipeline => ({
  ...pipeline(),
  definition: {
    ...pipeline().definition,
    pipeline_id: 'pdr',
    display_name: 'PDR',
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [assetContract('acce')],
      },
      {
        slot_id: 'gyro',
        required: true,
        max_assets: 1,
        accepted_contracts: [assetContract('gyro')],
      },
    ],
  },
})

const catalogEntry = (available = true) => {
  const snapshot = pipeline(available)
  return {
    pipeline_id: snapshot.definition.pipeline_id,
    display_name: snapshot.definition.display_name,
    definition_version: snapshot.definition.definition_version,
    digest: snapshot.digest,
    input_slots: snapshot.definition.input_slots,
    outputs: snapshot.definition.outputs,
    parameters_schema: snapshot.definition.parameters_schema,
    availability: snapshot.availability,
  }
}

const asset = (id: string, dataType: string, format = 'csv') => ({
  data_asset_id: id,
  data_type: dataType,
  schema_version: '1',
  format,
  validation_status: 'valid',
})

const provider = (assetsByRecording: Record<string, ReturnType<typeof asset>[]>) =>
  ({
    listAssets: vi.fn((recordingId: string) =>
      Promise.resolve(assetsByRecording[recordingId] ?? [])
    ),
  }) satisfies PipelineResourceProvider

describe('pipeline availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listRecordingAssetsMock.mockResolvedValue([])
    listBeaconsMock.mockResolvedValue([])
  })

  it('recordingのfloor_idからPNGのfloor map resourceを解決する', async () => {
    findRecordingMock.mockResolvedValue({
      upload_targets: [],
      floor_id: 'floor-1',
      organization_id: 'org-1',
    })
    findFloorMock.mockResolvedValue({
      floor_id: 'floor-1',
      organization_id: 'org-1',
      image_object_path: 'organizations/org-1/floors/floor-1/map.png',
    })
    getFloorMapBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]))

    await expect(recordingAssetProvider.listAssets('recording-1')).resolves.toContainEqual(
      expect.objectContaining({
        data_asset_id: 'floor-1',
        data_type: 'resource.floor_map',
        schema_version: '1',
        format: 'png',
        validation_status: 'valid',
        object_key: 'organizations/org-1/floors/floor-1/map.png',
        checksum_sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      })
    )
  })

  it('recordingのfloor_idから有効なbeacon layout resourceを解決する', async () => {
    findRecordingMock.mockResolvedValue({
      upload_targets: [],
      floor_id: 'floor-1',
      organization_id: 'org-1',
    })
    findFloorMock.mockResolvedValue({
      floor_id: 'floor-1',
      organization_id: 'org-1',
      image_object_path: 'organizations/org-1/floors/floor-1/map.jpg',
    })
    listBeaconsMock.mockResolvedValue([
      {
        id: 'beacon-2',
        floor_id: 'floor-1',
        pixel_x: 200,
        pixel_y: 100,
        enabled: true,
        deleted_at: null,
      },
      {
        id: 'beacon-1',
        floor_id: 'floor-1',
        pixel_x: 100,
        pixel_y: 50,
        enabled: true,
        deleted_at: null,
      },
    ])

    await expect(recordingAssetProvider.listAssets('recording-1')).resolves.toContainEqual(
      expect.objectContaining({
        data_type: 'resource.beacon_layout',
        schema_version: '1',
        format: 'json',
        validation_status: 'valid',
        object_key: expect.stringMatching(
          /^organizations\/org-1\/floors\/floor-1\/beacon-layout\/[a-f0-9]{64}\.json$/
        ),
        checksum_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    )
    expect(putBeaconLayoutMock).toHaveBeenCalledWith(
      expect.stringMatching(/^organizations\/org-1\/floors\/floor-1\/beacon-layout\//),
      expect.any(Uint8Array)
    )
    const layout = JSON.parse(
      new TextDecoder().decode(putBeaconLayoutMock.mock.calls[0][1] as Uint8Array)
    ) as { beacons: { beacon_id: string }[] }
    expect(layout.beacons.map((beacon) => beacon.beacon_id)).toEqual(['beacon-1', 'beacon-2'])
  })

  it.each([
    {
      label: '旧upload_targets方式',
      recording: {
        id: 'legacy-recording',
        organization_id: 'org-1',
        floor_id: 'floor-1',
        upload_targets: ['acce', 'gyro', 'metadata'],
      },
      assets: [],
      expectedAssets: [
        {
          data_asset_id: 'legacy:legacy-recording:acce',
          data_type: 'acce',
          object_key: 'organizations/org-1/recordings/legacy-recording/raw/acce.csv',
        },
        {
          data_asset_id: 'legacy:legacy-recording:gyro',
          data_type: 'gyro',
          object_key: 'organizations/org-1/recordings/legacy-recording/raw/gyro.csv',
        },
      ],
    },
    {
      label: 'typed asset方式',
      recording: {
        id: 'asset-recording',
        organization_id: 'org-1',
        floor_id: 'floor-1',
        upload_targets: ['metadata'],
      },
      assets: [asset('acce-1', 'acce'), asset('gyro-1', 'gyro')],
      expectedAssets: [
        { data_asset_id: 'acce-1', data_type: 'acce' },
        { data_asset_id: 'gyro-1', data_type: 'gyro' },
      ],
    },
  ])('$labelでもPDRの実行入力を解決できる', async ({ recording, assets, expectedAssets }) => {
    resolvePipelineMock.mockResolvedValue(pdrPipeline())
    findRecordingMock.mockResolvedValue(recording)
    listRecordingAssetsMock.mockResolvedValue(assets)

    await expect(resolvePipelineForExecution('pdr', [recording.id])).resolves.toMatchObject({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: recording.id,
            bindings: { acce: expect.any(String), gyro: expect.any(String) },
            issues: [],
            assets: expectedAssets,
          },
        ],
      },
    })
  })

  it('slot候補が1件ずつなら複数recordingを自動bindする', async () => {
    getCatalogMock.mockResolvedValue([catalogEntry()])
    const inputProvider = provider({
      first: [asset('acce-1', 'acce'), asset('map-1', 'resource.floor_map', 'png')],
      second: [asset('acce-2', 'acce'), asset('map-2', 'resource.floor_map', 'png')],
    })

    const result = await listPipelineAvailability(['first', 'second'], inputProvider)

    expect(result.pipelines[0]).toMatchObject({
      available: true,
      unavailable_reasons: [],
      recordings: [
        { recording_id: 'first', bindings: { acce: 'acce-1', floor_map: 'map-1' } },
        { recording_id: 'second', bindings: { acce: 'acce-2', floor_map: 'map-2' } },
      ],
    })
  })

  it('不足・resource不足・複数候補を構造化して全体を利用不可にする', async () => {
    getCatalogMock.mockResolvedValue([catalogEntry()])
    const inputProvider = provider({
      missing: [],
      ambiguous: [asset('acce-1', 'acce'), asset('acce-2', 'acce')],
    })

    const result = await listPipelineAvailability(['missing', 'ambiguous'], inputProvider)

    expect(result.pipelines[0].available).toBe(false)
    expect(result.pipelines[0].recordings).toEqual([
      {
        recording_id: 'missing',
        available: false,
        bindings: {},
        issues: [
          { slot_id: 'acce', code: 'MISSING_INPUT' },
          { slot_id: 'floor_map', code: 'RESOURCE_NOT_AVAILABLE' },
        ],
      },
      {
        recording_id: 'ambiguous',
        available: false,
        bindings: {},
        issues: [
          { slot_id: 'acce', code: 'AMBIGUOUS_INPUT' },
          { slot_id: 'floor_map', code: 'RESOURCE_NOT_AVAILABLE' },
        ],
      },
    ])
  })

  it('Nozomiが利用不可としたpipelineを選択可能にしない', async () => {
    getCatalogMock.mockResolvedValue([catalogEntry(false)])
    const inputProvider = provider({
      first: [asset('acce-1', 'acce'), asset('map-1', 'resource.floor_map', 'png')],
    })

    const result = await listPipelineAvailability(['first'], inputProvider)

    expect(result.pipelines[0]).toMatchObject({
      available: false,
      engine_availability: { available: false },
      unavailable_reasons: [{ code: 'unsupported_component', target: 'particle-filter' }],
    })
  })

  it('optional slotの候補がなければ利用不可にしない', async () => {
    const withOptional = catalogEntry()
    withOptional.input_slots.push({
      slot_id: 'ble',
      required: false,
      max_assets: 1,
      accepted_contracts: [assetContract('ble')],
    })
    getCatalogMock.mockResolvedValue([withOptional])
    const inputProvider = provider({
      first: [asset('acce-1', 'acce'), asset('map-1', 'resource.floor_map', 'png')],
    })

    const result = await listPipelineAvailability(['first'], inputProvider)

    expect(result.pipelines[0]).toMatchObject({ available: true, unavailable_reasons: [] })
  })

  it('実行前はfresh snapshotを再解決し入力不足を受理しない', async () => {
    resolvePipelineMock.mockResolvedValue(pipeline())

    await expect(
      resolvePipelineForExecution('pdr-particle-filter', ['first'], provider({ first: [] }))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: 'PIPELINE_INPUT_UNAVAILABLE' },
    })
    expect(resolvePipelineMock).toHaveBeenCalledWith('pdr-particle-filter')
    expect(getCatalogMock).not.toHaveBeenCalled()
  })

  it('実行前のengine利用不可を受理しない', async () => {
    resolvePipelineMock.mockResolvedValue(pipeline(false))

    await expect(
      resolvePipelineForExecution('pdr-particle-filter', ['first'], provider({ first: [] }))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: 'PIPELINE_UNAVAILABLE' },
    })
  })

  it('実行前にretired snapshotが返っても受理しない', async () => {
    const retired = pipeline()
    retired.definition.state = 'retired'
    resolvePipelineMock.mockResolvedValue(retired)

    await expect(
      resolvePipelineForExecution('pdr-particle-filter', ['first'], provider({ first: [] }))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: 'PIPELINE_UNAVAILABLE' },
    })
  })
})
