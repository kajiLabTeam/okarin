import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { Pipeline } from '../../schemas/pipelines.js'
import type { PositioningAnalysisRunRequest } from '../../schemas/positioning-analysis-runs.js'
import { createPositioningAnalysisRun } from './create-positioning-analysis-run.js'

const mocks = vi.hoisted(() => ({
  findKey: vi.fn(),
  findInOrg: vi.fn(),
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
        parameters_schema: { type: 'object', properties: { step_length_m: { type: 'number' } } },
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
    parameters_schema: { type: 'object', properties: { step_length_m: { type: 'number' } } },
  },
  availability: { available: true, reason: null },
  digest: 'a'.repeat(64),
}

describe('createPositioningAnalysisRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findKey.mockResolvedValue(null)
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
    ['pdr-ble', { origin_x: 120, origin_y: 240, floor_scale: 0.05, rssi_threshold_dbm: -70 }],
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

    expect(result).toMatchObject({ ok: true, value: { status: 'accepted', item_count: 1 } })
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

    expect(result).toMatchObject({ ok: true, value: { status: 'accepted', item_count: 1 } })
    expect(mocks.insertItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          parameters: { origin_x: 120, origin_y: 240, initial_direction: 90, floor_scale: 0.05 },
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

    expect(result).toMatchObject({ ok: true, value: { status: 'accepted', item_count: 1 } })
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

    expect(result).toEqual({ ok: false, error: { type: 'PARAMETERS_INVALID', status: 400 } })
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
        return Promise.resolve({ id: recordingId, floor_id: floorId, organization_id: orgId })
      return Promise.resolve({ id: rec2, floor_id: 'other-floor', organization_id: orgId })
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
})
