import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetContract, Pipeline } from '../../schemas/pipelines.js'
import type { PipelineResourceProvider } from './pipeline-availability.js'
import { listPipelineAvailability, resolvePipelineForExecution } from './pipeline-availability.js'

const { getCatalogMock, resolvePipelineMock } = vi.hoisted(() => ({
  getCatalogMock: vi.fn(),
  resolvePipelineMock: vi.fn(),
}))

vi.mock('./pipeline-catalog-cache.js', () => ({
  getCachedPipelineCatalog: getCatalogMock,
}))
vi.mock('./pipeline-client.js', () => ({
  resolveActivePipeline: resolvePipelineMock,
}))
vi.mock('../data-assets/index.js', () => ({
  listRecordingDataAssets: vi.fn(),
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
