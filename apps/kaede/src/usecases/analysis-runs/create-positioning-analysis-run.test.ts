import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { Pipeline } from '../../schemas/pipelines.js'
import type { PositioningAnalysisRunRequest } from '../../schemas/positioning-analysis-runs.js'
import { createPositioningAnalysisRun } from './create-positioning-analysis-run.js'

const mocks = vi.hoisted(() => ({
  findKey: vi.fn(),
  findInOrg: vi.fn(),
  listItems: vi.fn(),
  insertRun: vi.fn(),
  insertItems: vi.fn(),
  insertOutboxJobs: vi.fn(),
  findRecording: vi.fn(),
  findAuth: vi.fn(),
  findFloor: vi.fn(),
  resolvePipeline: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('../../services/analysis-runs/positioning-analysis-run-repository.js', () => ({
  findPositioningRunByKey: mocks.findKey,
  findPositioningRunInOrganization: mocks.findInOrg,
  insertPositioningRun: mocks.insertRun,
  listPositioningItems: mocks.listItems,
  insertPositioningItems: mocks.insertItems,
}))

vi.mock('../../services/analysis-runs/outbox-repository.js', () => ({
  insertOutboxJobs: mocks.insertOutboxJobs,
}))

vi.mock('../../services/recordings/index.js', () => ({
  findRecordingByIdForOrganization: mocks.findRecording,
  findRecordingAuthorizationByIdForOrganization: mocks.findAuth,
}))

vi.mock('../../services/floors/index.js', () => ({
  findFloorById: mocks.findFloor,
}))

vi.mock('../../services/nozomi/pipeline-availability.js', () => ({
  resolvePipelineForExecution: mocks.resolvePipeline,
}))

vi.mock('../../services/db/index.js', () => ({
  db: {
    transaction: () => ({
      execute: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    }),
  },
}))

const orgId = '11111111-1111-4111-8111-111111111111'
const recordingId = '22222222-2222-4222-8222-222222222222'
const runId = '33333333-3333-4333-8333-333333333333'
const floorId = '44444444-4444-4444-8444-444444444444'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '55555555-5555-4555-8555-555555555555',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: orgId, organization_name: 'Org', role: 'manager' }],
}

const mockPipeline: Pipeline = {
  definition: {
    pipeline_id: 'pdr',
    display_name: 'PDR Pipeline',
    definition_version: '1.0.0',
    state: 'active',
    components: [
      {
        component_id: 'rikka_pdr',
        instance_id: 'pdr_instance',
        input_slots: [],
        output_slots: [],
        parameters_schema: {
          type: 'object',
          properties: { step_length_m: { type: 'number' } },
        },
      },
    ],
    input_slots: [],
    outputs: [
      {
        output_slot_id: 'trajectory_geojson',
        source_component_instance: 'pdr_instance',
        source_slot_id: 'trajectory',
      },
    ],
    bindings: [],
    parameters_schema: {
      type: 'object',
      properties: { step_length_m: { type: 'number' } },
    },
  },
  availability: { available: true, reason: null },
  digest: 'a'.repeat(64),
}

const savedSnapshot = (pipelineId = 'pdr') => ({
  slot_bindings: { acce: 'acce-original' },
  pipeline_snapshot: { ...mockPipeline.definition, pipeline_id: pipelineId },
  pipeline_digest: 'b'.repeat(64),
  pipeline_version: mockPipeline.definition.definition_version,
  parameters: {
    origin_x: 12,
    origin_y: 34,
    floor_scale: 0.01,
    initial_direction: 123,
    user_height_m: 1.82,
    particle_seed: 42,
  },
  input_manifest: {
    acce: [
      {
        data_asset_id: 'acce-original',
        data_asset_object_id: 'object-original',
        object_key: 'original/acce.csv',
        checksum_sha256: 'c'.repeat(64),
        data_type: 'acce',
        schema_version: '1',
        format: 'csv',
      },
    ],
    __ground_truth__: {
      object_key: 'original/ground-truth.csv',
      checksum_sha256: 'd'.repeat(64),
      data_type: 'ground_truth_trajectory',
      schema_version: '1',
      format: 'csv',
    },
  },
})

describe('createPositioningAnalysisRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findKey.mockResolvedValue(null)
    mocks.findInOrg.mockResolvedValue(null)
    mocks.listItems.mockResolvedValue([])
    mocks.findRecording.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: orgId,
    })
    mocks.findAuth.mockResolvedValue({
      id: recordingId,
      organization_id: orgId,
      status: 'active',
      access_role: 'public',
      created_by_user_id: managerActor.user_id,
    })
    mocks.findFloor.mockResolvedValue({ id: floorId, scale: 0.05 })
    mocks.resolvePipeline.mockResolvedValue({
      ok: true,
      value: {
        pipeline: mockPipeline,
        recordings: [
          {
            recording_id: recordingId,
            assets: [],
            bindings: {},
            issues: [],
          },
        ],
      },
    })
    mocks.insertRun.mockResolvedValue({ id: runId })
    mocks.insertItems.mockResolvedValue([{ id: 'item-1' }])
    mocks.insertOutboxJobs.mockResolvedValue([])
  })

  it('正常に親Runと子Itemを作成して202 Acceptedを返し、Outboxジョブを同一トランザクションで登録する', async () => {
    const body: PositioningAnalysisRunRequest = {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: { pdr: { step_length_m: 0.7 } },
    }

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'idemp-1', body)

    expect(result).toEqual({
      ok: true,
      value: {
        analysis_run_id: runId,
        status: 'accepted',
        item_count: 1,
      },
    })
    expect(mocks.insertRun).toHaveBeenCalledOnce()
    expect(mocks.insertItems).toHaveBeenCalledOnce()
    expect(mocks.insertOutboxJobs).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          job_type: 'positioning_analysis_dispatch',
          payload: { analysis_run_item_id: 'item-1' },
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
        }),
      ],
      expect.anything()
    )
  })

  it('resolverが解決したfloor/beacon resourceを実行manifestへ固定する', async () => {
    const floorMap = {
      data_asset_id: 'resource:floor-1:floor-map',
      data_type: 'resource.floor_map',
      schema_version: '1',
      format: 'png',
      validation_status: 'valid',
      object_key: 'organizations/org-1/floors/floor-1/map.png',
      checksum_sha256: 'map-digest',
    }
    const beaconLayout = {
      data_asset_id: 'resource:floor-1:beacon-layout:layout-digest',
      data_type: 'resource.beacon_layout',
      schema_version: '1',
      format: 'json',
      validation_status: 'valid',
      object_key: 'organizations/org-1/floors/floor-1/beacon-layout/layout-digest.json',
      checksum_sha256: 'layout-digest',
    }
    mocks.resolvePipeline.mockResolvedValueOnce({
      ok: true,
      value: {
        pipeline: {
          ...mockPipeline,
          definition: {
            ...mockPipeline.definition,
            pipeline_id: 'pdr-particle-filter',
            input_slots: [
              {
                slot_id: 'acce',
                required: true,
                max_assets: 1,
                accepted_contracts: [
                  {
                    kind: 'asset',
                    data_type: 'acce',
                    schema_version: '1',
                    format: 'csv',
                  },
                ],
              },
              {
                slot_id: 'floor_map',
                required: true,
                max_assets: 1,
                accepted_contracts: [
                  {
                    kind: 'asset',
                    data_type: 'resource.floor_map',
                    schema_version: '1',
                    format: 'png',
                  },
                ],
              },
              {
                slot_id: 'beacon_layout',
                required: true,
                max_assets: 1,
                accepted_contracts: [
                  {
                    kind: 'asset',
                    data_type: 'resource.beacon_layout',
                    schema_version: '1',
                    format: 'json',
                  },
                ],
              },
            ],
          },
        },
        recordings: [
          {
            recording_id: recordingId,
            assets: [
              {
                data_asset_id: 'acce-1',
                data_type: 'acce',
                schema_version: '1',
                format: 'csv',
                validation_status: 'valid',
                object_key: 'organizations/org-1/recordings/recording-1/acce.csv',
                checksum_sha256: 'acce-digest',
              },
              floorMap,
              beaconLayout,
            ],
            bindings: {
              acce: 'acce-1',
              floor_map: floorMap.data_asset_id,
              beacon_layout: beaconLayout.data_asset_id,
            },
            issues: [],
          },
        ],
      },
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'resource-manifest', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr-particle-filter'],
      parameters_by_pipeline: {},
    })

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'accepted', item_count: 1 },
    })
    expect(mocks.insertItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          slot_bindings: {
            acce: 'acce-1',
            floor_map: floorMap.data_asset_id,
            beacon_layout: beaconLayout.data_asset_id,
          },
          input_manifest: {
            acce: [
              expect.objectContaining({
                object_key: expect.stringContaining('/acce.csv'),
              }),
            ],
            floor_map: [
              expect.objectContaining({
                data_asset_id: floorMap.data_asset_id,
                object_key: floorMap.object_key,
                checksum_sha256: floorMap.checksum_sha256,
              }),
            ],
            beacon_layout: [
              expect.objectContaining({
                data_asset_id: beaconLayout.data_asset_id,
                object_key: beaconLayout.object_key,
                checksum_sha256: beaconLayout.checksum_sha256,
              }),
            ],
          },
        }),
      ],
      expect.anything()
    )
  })

  it.each([
    ['pdr', {}],
    [
      'pdr-particle-filter',
      {
        origin_x: 120,
        origin_y: 240,
        floor_scale: 0.05,
        particle_count: 128,
        particle_seed: null,
      },
    ],
    [
      'pdr-ble',
      {
        origin_x: 120,
        origin_y: 240,
        floor_scale: 0.05,
        rssi_threshold_dbm: -70,
      },
    ],
    [
      'pdr-particle-filter-ble',
      {
        origin_x: 120,
        origin_y: 240,
        floor_scale: 0.05,
        particle_count: 128,
        particle_seed: 7,
        rssi_threshold_dbm: -70,
      },
    ],
  ])('Nozomiの%s向けパラメータを受け付ける', async (pipelineId, parameters) => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        origin_x: { type: 'integer', minimum: 0 },
        origin_y: { type: 'integer', minimum: 0 },
        floor_scale: { type: 'number', exclusiveMinimum: 0 },
        particle_count: { type: 'integer', minimum: 1, maximum: 100_000 },
        particle_seed: { type: ['integer', 'null'] },
        rssi_threshold_dbm: { type: 'number', minimum: -150, maximum: 0 },
      },
      required: pipelineId === 'pdr' ? [] : ['origin_x', 'origin_y', 'floor_scale'],
    }
    mocks.resolvePipeline.mockResolvedValueOnce({
      ok: true,
      value: {
        pipeline: {
          ...mockPipeline,
          definition: {
            ...mockPipeline.definition,
            pipeline_id: pipelineId,
            parameters_schema: schema,
          },
        },
        recordings: [{ recording_id: recordingId, assets: [], bindings: {}, issues: [] }],
      },
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, `schema-${pipelineId}`, {
      recording_ids: [recordingId],
      pipeline_ids: [pipelineId],
      parameters_by_pipeline: { [pipelineId]: parameters },
    })

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'accepted', item_count: 1 },
    })
  })

  it('録画開始時のconstraintsとフロアスケールから必須パラメータを補完する', async () => {
    mocks.findRecording.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: orgId,
      constraints: [{ seq: 0, point_type: 'start', x: 120, y: 240, direction: 90 }],
    })
    mocks.resolvePipeline.mockResolvedValueOnce({
      ok: true,
      value: {
        pipeline: {
          ...mockPipeline,
          definition: {
            ...mockPipeline.definition,
            pipeline_id: 'pdr-particle-filter',
            parameters_schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                origin_x: { type: 'integer' },
                origin_y: { type: 'integer' },
                initial_direction: { type: 'number' },
                floor_scale: { type: 'number', exclusiveMinimum: 0 },
              },
              required: ['origin_x', 'origin_y', 'floor_scale'],
            },
          },
        },
        recordings: [{ recording_id: recordingId, assets: [], bindings: {}, issues: [] }],
      },
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'derived-parameters', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr-particle-filter'],
      parameters_by_pipeline: {},
    })

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'accepted', item_count: 1 },
    })
    expect(mocks.insertItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          parameters: {
            origin_x: 120,
            origin_y: 240,
            initial_direction: 90,
            floor_scale: 0.05,
          },
        }),
      ],
      expect.anything()
    )
  })

  it('パイプラインのスキーマにない補完パラメータは追加しない', async () => {
    mocks.findRecording.mockResolvedValue({
      id: recordingId,
      floor_id: floorId,
      organization_id: orgId,
      constraints: [{ seq: 0, point_type: 'start', x: 120, y: 240, direction: 90 }],
    })
    mocks.resolvePipeline.mockResolvedValueOnce({
      ok: true,
      value: {
        pipeline: {
          ...mockPipeline,
          definition: {
            ...mockPipeline.definition,
            parameters_schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                initial_direction: { type: 'number', minimum: 0, maximum: 360 },
                user_height_m: { type: 'number', exclusiveMinimum: 0 },
              },
              required: [],
            },
          },
        },
        recordings: [{ recording_id: recordingId, assets: [], bindings: {}, issues: [] }],
      },
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'pdr-only', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
    })

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'accepted', item_count: 1 },
    })
    expect(mocks.insertItems).toHaveBeenCalledWith(
      [expect.objectContaining({ parameters: { initial_direction: 90 } })],
      expect.anything()
    )
  })

  it('Nozomiが拒否する未知パラメータとinteger以外の値を受付時に拒否する', async () => {
    mocks.resolvePipeline.mockResolvedValueOnce({
      ok: true,
      value: {
        pipeline: {
          ...mockPipeline,
          definition: {
            ...mockPipeline.definition,
            parameters_schema: {
              type: 'object',
              additionalProperties: false,
              properties: { origin_x: { type: 'integer', minimum: 0 } },
              required: ['origin_x'],
            },
          },
        },
        recordings: [{ recording_id: recordingId, assets: [], bindings: {}, issues: [] }],
      },
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'schema-invalid', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: { pdr: { origin_x: 1.5, unknown: true } },
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'PARAMETERS_INVALID', status: 400 },
    })
  })

  it('同一Idempotency-Keyかつ同一リクエストなら既存のRunを返す', async () => {
    const { createHash } = await import('node:crypto')
    const body: PositioningAnalysisRunRequest = {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
    }
    const canonical = (val: unknown): unknown => {
      if (Array.isArray(val))
        return val.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      if (val && typeof val === 'object')
        return Object.fromEntries(
          Object.entries(val)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)])
        )
      return val
    }
    const computedDigest = createHash('sha256')
      .update(JSON.stringify(canonical(body)))
      .digest('hex')
    mocks.findKey.mockResolvedValue({
      id: runId,
      request_digest: computedDigest,
    })

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'idemp-1', body)
    expect(result).toEqual({
      ok: true,
      value: {
        analysis_run_id: runId,
        status: 'accepted',
        item_count: 1,
      },
    })
  })

  it('複数フロアの録画データが混在している場合は409エラーを返す', async () => {
    const rec2 = '66666666-6666-4666-8666-666666666666'
    mocks.findRecording.mockImplementation((id: string) => {
      if (id === recordingId)
        return Promise.resolve({
          id: recordingId,
          floor_id: floorId,
          organization_id: orgId,
        })
      return Promise.resolve({
        id: rec2,
        floor_id: 'other-floor',
        organization_id: orgId,
      })
    })
    mocks.findAuth.mockResolvedValue({
      id: rec2,
      organization_id: orgId,
      status: 'active',
      access_role: 'public',
      created_by_user_id: managerActor.user_id,
    })

    const body: PositioningAnalysisRunRequest = {
      recording_ids: [recordingId, rec2],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
    }

    const result = await createPositioningAnalysisRun(managerActor, orgId, 'idemp-2', body)
    expect(result).toEqual({
      ok: false,
      error: { type: 'RECORDING_SCOPE_INVALID', status: 409 },
    })
  })

  it('権限のないメンバーの場合はFORBIDDENエラーを返す', async () => {
    const memberActor: RequestActor = {
      ...managerActor,
      memberships: [{ organization_id: orgId, organization_name: 'Org', role: 'member' }],
    }
    const body: PositioningAnalysisRunRequest = {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
    }

    const result = await createPositioningAnalysisRun(memberActor, orgId, 'idemp-3', body)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('AUTH_DASHBOARD_FORBIDDEN')
    }
  })
  it.each(['failed', 'all'] as const)(
    '対象セルだけを再実行し、比較元runは失敗分の場合だけ引き継ぐ: %s',
    async (mode) => {
      const rec2 = '66666666-6666-4666-8666-666666666666'
      const rootId = '77777777-7777-4777-8777-777777777777'
      const failed = [
        {
          id: '88888888-8888-4888-8888-888888888888',
          recording_id: recordingId,
          pipeline_id: 'pdr',
          ...savedSnapshot('pdr'),
          status: mode === 'failed' ? 'failed' : 'completed',
        },
        {
          id: '99999999-9999-4999-8999-999999999999',
          recording_id: rec2,
          pipeline_id: 'pf',
          ...savedSnapshot('pf'),
          status: mode === 'failed' ? 'failed' : 'completed',
        },
      ]
      mocks.findInOrg.mockResolvedValue({
        id: runId,
        comparison_run_id: rootId,
      })
      mocks.listItems.mockResolvedValue(failed)
      mocks.findRecording.mockImplementation((id: string) =>
        Promise.resolve({ id, floor_id: floorId })
      )
      mocks.resolvePipeline.mockImplementation((pipelineId: string, ids: string[]) =>
        Promise.resolve({
          ok: true,
          value: {
            pipeline: {
              ...mockPipeline,
              definition: {
                ...mockPipeline.definition,
                pipeline_id: pipelineId,
              },
            },
            recordings: ids.map((id) => ({
              recording_id: id,
              assets: [],
              bindings: {},
            })),
          },
        })
      )
      const result = await createPositioningAnalysisRun(managerActor, orgId, 'sparse-retry', {
        recording_ids: [recordingId, rec2],
        pipeline_ids: ['pdr', 'pf'],
        parameters_by_pipeline: {},
        retry_of_analysis_run_id: runId,
        ...(mode === 'failed'
          ? { retry_failed_item_ids: failed.map((item) => item.id) }
          : { retry_item_ids: failed.map((item) => item.id) }),
      })
      expect(result).toMatchObject({ ok: true, value: { item_count: 2 } })
      expect(mocks.resolvePipeline).not.toHaveBeenCalled()
      expect(mocks.findFloor).not.toHaveBeenCalled()
      expect(
        mocks.insertItems.mock.calls[0][0].map(
          (item: { recording_id: string; pipeline_id: string }) => [
            item.recording_id,
            item.pipeline_id,
          ]
        )
      ).toEqual([
        [recordingId, 'pdr'],
        [rec2, 'pf'],
      ])
      expect(mocks.insertRun.mock.calls[0][0].comparison_run_id).toBe(
        mode === 'failed' ? rootId : null
      )
    }
  )

  it.each(['completed', 'processing', 'missing'])(
    '失敗済みの元run内のセル以外を再実行できない: %s',
    async (state) => {
      const id = '88888888-8888-4888-8888-888888888888'
      mocks.findInOrg.mockResolvedValue({ id: runId })
      mocks.listItems.mockResolvedValue(
        state === 'missing'
          ? []
          : [
              {
                id,
                recording_id: recordingId,
                pipeline_id: 'pdr',
                status: state,
              },
            ]
      )
      const result = await createPositioningAnalysisRun(managerActor, orgId, 'invalid-retry', {
        recording_ids: [recordingId],
        pipeline_ids: ['pdr'],
        parameters_by_pipeline: {},
        retry_of_analysis_run_id: runId,
        retry_failed_item_ids: [id],
      })
      expect(result).toMatchObject({
        ok: false,
        error: { type: 'RETRY_ITEMS_INVALID' },
      })
      expect(mocks.insertRun).not.toHaveBeenCalled()
    }
  )

  it.each(['object', 'json'] as const)(
    '現在の縮尺・constraints・資源を再解決せず、元itemの入力・明示値・正解軌跡を再利用する: %s',
    async (format) => {
      const snapshot = savedSnapshot()
      const stored = Object.fromEntries(
        Object.entries(snapshot).map(([key, value]) => [
          key,
          format === 'json' && typeof value === 'object' ? JSON.stringify(value) : value,
        ])
      )
      const item = {
        id: 'original-item',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'completed',
        ...stored,
      }
      mocks.findInOrg.mockResolvedValue({ id: runId })
      mocks.listItems.mockResolvedValue([item])
      mocks.findRecording.mockResolvedValue({
        id: recordingId,
        floor_id: floorId,
        constraints: [{ seq: 0, point_type: 'start', x: 999, y: 888, direction: 270 }],
      })
      mocks.findFloor.mockResolvedValue({ id: floorId, scale: 0.5 })
      mocks.resolvePipeline.mockRejectedValue(new Error('Current resources are unavailable'))

      const result = await createPositioningAnalysisRun(managerActor, orgId, 'saved-retry', {
        recording_ids: [recordingId],
        pipeline_ids: ['pdr'],
        parameters_by_pipeline: {},
        retry_of_analysis_run_id: runId,
        retry_item_ids: ['original-item'],
      })

      expect(result).toMatchObject({ ok: true, value: { item_count: 1 } })
      expect(mocks.insertItems).toHaveBeenCalledWith(
        [
          {
            ...snapshot,
            recording_id: recordingId,
            pipeline_id: 'pdr',
            analysis_run_id: runId,
            status: 'queued',
            error: null,
          },
        ],
        expect.anything()
      )
      expect(mocks.resolvePipeline).not.toHaveBeenCalled()
      expect(mocks.findFloor).not.toHaveBeenCalled()
      expect(mocks.findAuth).toHaveBeenCalledWith(recordingId, orgId)
      expect(item).toEqual({
        id: 'original-item',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'completed',
        ...stored,
      })
    }
  )

  it('item指定のない旧形式の再実行も、元run内の対象itemだけを条件を保って引き継ぐ', async () => {
    const rec2 = '66666666-6666-4666-8666-666666666666'
    const items = [
      {
        ...savedSnapshot(),
        id: 'first',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'completed',
      },
      {
        ...savedSnapshot('pf'),
        id: 'second',
        recording_id: rec2,
        pipeline_id: 'pf',
        status: 'failed',
      },
      {
        ...savedSnapshot('other'),
        id: 'ignored',
        recording_id: rec2,
        pipeline_id: 'other',
        status: 'completed',
      },
    ]
    mocks.findInOrg.mockResolvedValue({ id: runId })
    mocks.listItems.mockResolvedValue(items)
    mocks.findRecording.mockImplementation((id: string) =>
      Promise.resolve({ id, floor_id: floorId })
    )
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'legacy-retry-request', {
      recording_ids: [recordingId, rec2],
      pipeline_ids: ['pdr', 'pf'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
    })
    expect(result).toMatchObject({ ok: true, value: { item_count: 2 } })
    expect(mocks.insertItems.mock.calls[0][0]).toHaveLength(2)
    expect(mocks.resolvePipeline).not.toHaveBeenCalled()
  })

  it.each([
    { parameters_by_pipeline: { pdr: { user_height_m: 1.9 } } },
    { ground_truth_csv: 'different ground truth' },
  ])('元runの再実行に条件変更を混在させない: %j', async (override) => {
    mocks.findInOrg.mockResolvedValue({ id: runId })
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'override-retry', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
      ...override,
    })
    expect(result).toMatchObject({
      ok: false,
      error: { type: 'RETRY_CONDITIONS_OVERRIDE', status: 409 },
    })
    expect(mocks.insertRun).not.toHaveBeenCalled()
    expect(mocks.resolvePipeline).not.toHaveBeenCalled()
  })

  it.each([
    'missing_hash',
    'missing_input',
    'invalid_json',
    'missing_snapshot',
    'missing_ground_truth_hash',
  ])('元の入力を確認できないときは現在の資源で補完しない: %s', async (problem) => {
    const snapshot = savedSnapshot()
    const item = {
      ...snapshot,
      id: 'original-item',
      recording_id: recordingId,
      pipeline_id: 'pdr',
      status: 'failed',
      parameters: snapshot.parameters as unknown,
      pipeline_snapshot: snapshot.pipeline_snapshot as unknown,
      input_manifest: snapshot.input_manifest as unknown,
    }
    if (problem === 'missing_hash') snapshot.input_manifest.acce[0].checksum_sha256 = ''
    if (problem === 'missing_input') item.input_manifest = {}
    if (problem === 'invalid_json') item.parameters = '{broken'
    if (problem === 'missing_snapshot') item.pipeline_snapshot = null
    if (problem === 'missing_ground_truth_hash')
      snapshot.input_manifest.__ground_truth__.checksum_sha256 = ''
    mocks.findInOrg.mockResolvedValue({ id: runId })
    mocks.listItems.mockResolvedValue([item])
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'invalid-snapshot', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
      retry_failed_item_ids: ['original-item'],
    })
    expect(result).toMatchObject({
      ok: false,
      error: { type: 'RETRY_SNAPSHOT_UNAVAILABLE', status: 409 },
    })
    expect(mocks.insertRun).not.toHaveBeenCalled()
    expect(mocks.resolvePipeline).not.toHaveBeenCalled()
  })

  it('再実行でも現在の録画データへのアクセス権限を確認する', async () => {
    mocks.findInOrg.mockResolvedValue({ id: runId })
    mocks.listItems.mockResolvedValue([
      {
        ...savedSnapshot(),
        id: 'original-item',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'completed',
      },
    ])
    mocks.findAuth.mockResolvedValue(null)
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'unauthorized-retry', {
      recording_ids: [recordingId],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
      retry_item_ids: ['original-item'],
    })
    expect(result).toMatchObject({
      ok: false,
      error: { type: 'RECORDING_NOT_FOUND', status: 404 },
    })
    expect(mocks.insertRun).not.toHaveBeenCalled()
  })

  it('同じpipelineでもrecordingごとの元パラメータを個別に保持する', async () => {
    const rec2 = '66666666-6666-4666-8666-666666666666'
    const first = savedSnapshot()
    const second = savedSnapshot()
    second.parameters = {
      ...second.parameters,
      origin_x: 60,
      user_height_m: 1.55,
      particle_seed: 7,
    }
    second.input_manifest.acce[0].object_key = 'second/acce.csv'
    mocks.findInOrg.mockResolvedValue({ id: runId })
    mocks.listItems.mockResolvedValue([
      {
        ...first,
        id: 'first',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'failed',
      },
      {
        ...second,
        id: 'second',
        recording_id: rec2,
        pipeline_id: 'pdr',
        status: 'failed',
      },
    ])
    mocks.findRecording.mockImplementation((id: string) =>
      Promise.resolve({ id, floor_id: floorId })
    )
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'per-recording-retry', {
      recording_ids: [recordingId, rec2],
      pipeline_ids: ['pdr'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
      retry_failed_item_ids: ['first', 'second'],
    })
    expect(result).toMatchObject({ ok: true, value: { item_count: 2 } })
    expect(mocks.insertItems.mock.calls[0][0]).toMatchObject([
      { parameters: first.parameters, input_manifest: first.input_manifest },
      { parameters: second.parameters, input_manifest: second.input_manifest },
    ])
  })

  it('item指定なしの再実行を同じキーで再送しても、実際に作成した対象件数を返す', async () => {
    const body = {
      recording_ids: [recordingId, '66666666-6666-4666-8666-666666666666'],
      pipeline_ids: ['pdr', 'pf'],
      parameters_by_pipeline: {},
      retry_of_analysis_run_id: runId,
    }
    mocks.findInOrg.mockResolvedValue({ id: runId })
    mocks.listItems.mockResolvedValue([
      {
        ...savedSnapshot(),
        id: 'first',
        recording_id: recordingId,
        pipeline_id: 'pdr',
        status: 'failed',
      },
      {
        ...savedSnapshot('pf'),
        id: 'second',
        recording_id: body.recording_ids[1],
        pipeline_id: 'pf',
        status: 'failed',
      },
    ])
    mocks.findRecording.mockImplementation((id: string) =>
      Promise.resolve({ id, floor_id: floorId })
    )
    await createPositioningAnalysisRun(managerActor, orgId, 'repeat-retry', body)
    mocks.findKey.mockResolvedValue({
      id: runId,
      request_digest: mocks.insertRun.mock.calls[0][0].request_digest,
    })
    const result = await createPositioningAnalysisRun(managerActor, orgId, 'repeat-retry', body)
    expect(result).toMatchObject({ ok: true, value: { item_count: 2 } })
    expect(mocks.insertRun).toHaveBeenCalledOnce()
  })
})
