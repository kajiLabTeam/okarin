import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetRuntimeConfigForTests } from '../../src/config/runtime.js'
import type { Pipeline } from '../../src/schemas/pipelines.js'
import { createApp } from '../../src/server.js'
import { claimPendingOutboxJobs, processOutboxJob } from '../../src/services/analysis-runs/index.js'
import {
  insertDataAsset,
  insertDataAssetObject,
  linkRecordingDataAsset,
} from '../../src/services/data-assets/index.js'
import { createDb } from '../../src/services/db/client.js'
import { clearPipelineCatalogCache } from '../../src/services/nozomi/pipeline-catalog-cache.js'
import { buildDataAssetObjectKey, resetS3ClientForTests } from '../../src/services/storage/index.js'
import { resetDatabase } from '../db/helpers.js'
import { createRecordingFixture } from '../fixtures/recordings.js'
import { createStorageClient, putObjectText } from '../storage/support/helpers.js'

const db = createDb()
const s3 = createStorageClient()
let app: ReturnType<typeof createApp>

const sharedToken = 'test-e2e-shared-token'
const authHeaders = {
  authorization: `Bearer ${sharedToken}`,
}

const pdrPipeline: Pipeline = {
  definition: {
    pipeline_id: 'pdr',
    display_name: 'PDR Pipeline',
    definition_version: '1.0.0',
    state: 'active',
    components: [
      {
        component_id: 'pdr_comp',
        instance_id: 'pdr_instance',
        input_slots: [
          {
            slot_id: 'acce',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
            ],
          },
          {
            slot_id: 'gyro',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'gyro', schema_version: '1', format: 'csv' },
            ],
          },
        ],
        output_slots: [
          {
            slot_id: 'pose',
            required: true,
            max_assets: 1,
            accepted_contracts: [{ kind: 'internal_value', value_type: 'pose' }],
          },
        ],
        parameters_schema: {
          type: 'object',
          properties: {
            step_length_m: { type: 'number' },
          },
        },
      },
    ],
    outputs: [
      {
        output_slot_id: 'pose',
        source_component_instance: 'pdr_instance',
        source_slot_id: 'pose',
      },
    ],
    bindings: [
      {
        target_component_instance: 'pdr_instance',
        target_slot_id: 'acce',
        source_component_instance: null,
        source_slot_id: 'acce',
      },
      {
        target_component_instance: 'pdr_instance',
        target_slot_id: 'gyro',
        source_component_instance: null,
        source_slot_id: 'gyro',
      },
    ],
    parameters_schema: {
      type: 'object',
      properties: {
        step_length_m: { type: 'number' },
      },
    },
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
        ],
      },
      {
        slot_id: 'gyro',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'gyro', schema_version: '1', format: 'csv' },
        ],
      },
    ],
  },
  availability: { available: true, reason: null },
  digest: '1111111111111111111111111111111111111111111111111111111111111111',
}

const pdrBlePipeline: Pipeline = {
  definition: {
    pipeline_id: 'pdr-ble',
    display_name: 'PDR + BLE Pipeline',
    definition_version: '1.0.0',
    state: 'active',
    components: [
      {
        component_id: 'pdr_ble_comp',
        instance_id: 'pdr_ble_instance',
        input_slots: [
          {
            slot_id: 'acce',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
            ],
          },
          {
            slot_id: 'gyro',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'gyro', schema_version: '1', format: 'csv' },
            ],
          },
          {
            slot_id: 'ble',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'ble', schema_version: '1', format: 'csv' },
            ],
          },
        ],
        output_slots: [
          {
            slot_id: 'pose',
            required: true,
            max_assets: 1,
            accepted_contracts: [{ kind: 'internal_value', value_type: 'pose' }],
          },
        ],
        parameters_schema: {
          type: 'object',
          properties: {
            rssi_threshold: { type: 'integer' },
          },
        },
      },
    ],
    outputs: [
      {
        output_slot_id: 'pose',
        source_component_instance: 'pdr_ble_instance',
        source_slot_id: 'pose',
      },
    ],
    bindings: [
      {
        target_component_instance: 'pdr_ble_instance',
        target_slot_id: 'acce',
        source_component_instance: null,
        source_slot_id: 'acce',
      },
      {
        target_component_instance: 'pdr_ble_instance',
        target_slot_id: 'gyro',
        source_component_instance: null,
        source_slot_id: 'gyro',
      },
      {
        target_component_instance: 'pdr_ble_instance',
        target_slot_id: 'ble',
        source_component_instance: null,
        source_slot_id: 'ble',
      },
    ],
    parameters_schema: {
      type: 'object',
      properties: {
        rssi_threshold: { type: 'integer' },
      },
    },
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
        ],
      },
      {
        slot_id: 'gyro',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'gyro', schema_version: '1', format: 'csv' },
        ],
      },
      {
        slot_id: 'ble',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'ble', schema_version: '1', format: 'csv' },
        ],
      },
    ],
  },
  availability: { available: true, reason: null },
  digest: '2222222222222222222222222222222222222222222222222222222222222222',
}

const setupRecordingWithAssets = async (
  organizationId: string,
  recordingId: string,
  dataTypes: ('acce' | 'gyro' | 'ble')[]
) => {
  for (const dataType of dataTypes) {
    const asset = await insertDataAsset(
      {
        organization_id: organizationId,
        data_type: dataType,
        schema_version: '1',
        validation_status: 'valid',
      },
      db
    )

    const objectKey = buildDataAssetObjectKey(organizationId, recordingId, asset.id, 'csv')
    const sampleCsv =
      dataType === 'ble'
        ? 'timestamp,beacon_mac,rssi\n1700000000,AA:BB:CC:DD:EE:FF,-65\n'
        : 'timestamp,x,y,z\n1700000000,0.1,0.2,9.8\n'

    await insertDataAssetObject(
      {
        data_asset_id: asset.id,
        object_key: objectKey,
        content_type: 'text/csv',
        format: 'csv',
        checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        byte_size: sampleCsv.length,
      },
      db
    )

    await linkRecordingDataAsset(
      {
        organization_id: organizationId,
        recording_id: recordingId,
        data_asset_id: asset.id,
        data_type: dataType,
      },
      db
    )

    await putObjectText(s3, objectKey, sampleCsv, 'text/csv')
  }
}

describe('Analysis Run Pipeline E2E Integration', () => {
  const originalFetch = globalThis.fetch
  const nozomiBaseUrl = 'http://nozomi-mock.internal'
  const dispatchedRequests: {
    analysis_run_item_id: string
    pipeline_id: string
    output_uri: string
    inputs: unknown[]
    callback: { url: string; secret?: string | null }
  }[] = []

  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = sharedToken
    process.env.NOZOMI_INTERNAL_ENDPOINT = nozomiBaseUrl
    resetRuntimeConfigForTests()
    clearPipelineCatalogCache()
    resetS3ClientForTests()
    await resetDatabase(db)
    app = createApp()
    dispatchedRequests.length = 0

    // Nozomi の HTTP 通信をインターセプトするモック
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith(nozomiBaseUrl)) {
        const path = url.slice(nozomiBaseUrl.length)
        if (path === '/pipelines') {
          return new Response(JSON.stringify([pdrPipeline, pdrBlePipeline]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (path === '/internal/pipelines/pdr') {
          return new Response(JSON.stringify(pdrPipeline), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (path === '/internal/pipelines/pdr-ble') {
          return new Response(JSON.stringify(pdrBlePipeline), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (path === '/internal/pipeline-executions' && init?.method === 'POST') {
          const body = JSON.parse(init.body as string) as (typeof dispatchedRequests)[number]
          dispatchedRequests.push(body)
          return new Response(
            JSON.stringify({
              analysis_run_item_id: body.analysis_run_item_id,
              status: 'processing',
            }),
            {
              status: 202,
              headers: { 'content-type': 'application/json' },
            }
          )
        }
        return new Response('Not found', { status: 404 })
      }
      // S3 presigned URL への通信等はオリジナルの fetch を実行
      return originalFetch(input, init)
    })
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    s3.destroy()
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    Reflect.deleteProperty(process.env, 'NOZOMI_INTERNAL_ENDPOINT')
    resetRuntimeConfigForTests()
  })

  it('複数Recording × 複数Pipelineの測位実行からS3保存・Callback・比較用map-data取得までの一連の経路が通る', async () => {
    // 1. 同一フロアの2つのRecordingを準備
    const fixture1 = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })
    const organizationId = fixture1.organizationId
    const floorId = fixture1.floorId
    const recording1Id = fixture1.recordingId

    // recording2 は同じ organization と floor を共有
    const fixture2 = await db
      .insertInto('recordings')
      .values({
        pedestrian_id: fixture1.pedestrianId,
        floor_id: floorId,
        organization_id: organizationId,
        upload_status: 'ready',
        upload_targets: ['acce', 'gyro'],
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const recording2Id = fixture2.id

    // 各 Recording に acce, gyro, ble のデータ資産を登録
    await setupRecordingWithAssets(organizationId, recording1Id, ['acce', 'gyro', 'ble'])
    await setupRecordingWithAssets(organizationId, recording2Id, ['acce', 'gyro', 'ble'])

    // 2. POST /api/organizations/:id/positioning-analysis-runs で一括実行を要求 (2 recordings × 2 pipelines = 4 items)
    const runResponse = await app.request(
      `/api/organizations/${organizationId}/positioning-analysis-runs`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'idempotency-key': 'e2e-run-test-key-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          recording_ids: [recording1Id, recording2Id],
          pipeline_ids: ['pdr', 'pdr-ble'],
          parameters_by_pipeline: {
            pdr: { step_length_m: 0.65 },
            'pdr-ble': { rssi_threshold: -75 },
          },
        }),
      }
    )

    expect(runResponse.status).toBe(202)
    const runJson = (await runResponse.json()) as {
      analysis_run_id: string
      status: string
      item_count: number
    }

    const runId = runJson.analysis_run_id
    expect(runJson.status).toBe('accepted')
    expect(runJson.item_count).toBe(4)

    // 初期状態の確認
    const getRunInitial = await app.request(
      `/api/organizations/${organizationId}/positioning-analysis-runs/${runId}`,
      { headers: authHeaders }
    )
    expect(getRunInitial.status).toBe(200)
    const runInitialJson = (await getRunInitial.json()) as {
      analysis_run_id: string
      status: string
      progress: {
        total: number
        queued: number
        processing: number
        completed: number
        failed: number
      }
      items: { id: string; recording_id: string; pipeline_id: string; status: string }[]
    }
    expect(runInitialJson.status).toBe('accepted')
    expect(runInitialJson.progress.total).toBe(4)
    expect(runInitialJson.progress.queued).toBe(4)
    expect(runInitialJson.items).toHaveLength(4)
    expect(runInitialJson.items.every((item) => item.status === 'queued')).toBe(true)

    // 3. Outbox Worker による配送処理を実行
    const outboxJobs = await claimPendingOutboxJobs(10, db)
    expect(outboxJobs).toHaveLength(4)

    for (const job of outboxJobs) {
      await processOutboxJob(job, db)
    }

    expect(dispatchedRequests).toHaveLength(4)

    // 親 Run と子 Item のステータスが processing に更新されていることを確認
    const getRunProcessing = await app.request(
      `/api/organizations/${organizationId}/positioning-analysis-runs/${runId}`,
      { headers: authHeaders }
    )
    expect(getRunProcessing.status).toBe(200)
    const runProcessingJson = (await getRunProcessing.json()) as {
      status: string
      progress: { processing: number }
      items: { id: string; status: string }[]
    }
    expect(runProcessingJson.status).toBe('processing')
    expect(runProcessingJson.progress.processing).toBe(4)
    expect(runProcessingJson.items.every((item) => item.status === 'processing')).toBe(true)

    // 4. Nozomi による測位実行シミュレーション:
    // 4 items のうち、3 items を「成功」（S3 へ CSV 保存）、1 item を「失敗」（BLE 信号不足）とする
    const successItems = dispatchedRequests.slice(0, 3)
    const failedItem = dispatchedRequests[3]

    // 成功した 3 items の結果 CSV
    const resultCsvContent = [
      'timestamp,x,y,z',
      '1700000000,10.0,20.0,0.0',
      '1700000001,11.5,21.5,0.0',
      '1700000002,13.0,23.0,0.0',
    ].join('\n')

    for (const req of successItems) {
      // Nozomi が output_uri（S3 presigned URL）へ結果 CSV を PUT
      const uploadRes = await fetch(req.output_uri, {
        method: 'PUT',
        headers: { 'content-type': 'text/csv' },
        body: resultCsvContent,
      })
      expect(uploadRes.ok).toBe(true)

      // Nozomi が Kaede のコールバック API を呼ぶ
      const callbackRes = await app.request('/api/internal/pipeline-executions/callbacks', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          event_id: randomUUID(),
          analysis_run_item_id: req.analysis_run_item_id,
          status: 'completed',
        }),
      })
      expect(callbackRes.status).toBe(200)
    }

    // 失敗した 1 item のコールバック
    const failedCallbackRes = await app.request('/api/internal/pipeline-executions/callbacks', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event_id: randomUUID(),
        analysis_run_item_id: failedItem.analysis_run_item_id,
        status: 'failed',
        error: {
          code: 'INSUFFICIENT_BLE_BEACONS',
          message: 'Beacon count is below minimum required threshold',
        },
      }),
    })
    expect(failedCallbackRes.status).toBe(200)

    // 5. 親 Run 集約状態の確認（部分成功: partially_completed）
    const getRunCompleted = await app.request(
      `/api/organizations/${organizationId}/positioning-analysis-runs/${runId}`,
      { headers: authHeaders }
    )
    expect(getRunCompleted.status).toBe(200)
    const runCompletedJson = (await getRunCompleted.json()) as {
      status: string
      progress: { completed: number; failed: number }
      items: {
        id: string
        status: string
        result_trajectory_id: string | null
        error: { code: string; message: string } | null
      }[]
    }

    expect(runCompletedJson.status).toBe('partially_completed')
    expect(runCompletedJson.progress.completed).toBe(3)
    expect(runCompletedJson.progress.failed).toBe(1)

    const completedItems = runCompletedJson.items.filter((i) => i.status === 'completed')
    const failedItems = runCompletedJson.items.filter((i) => i.status === 'failed')
    expect(completedItems).toHaveLength(3)
    expect(failedItems).toHaveLength(1)

    // 成功した item には result_trajectory_id (= item.id) がセットされている
    for (const item of completedItems) {
      expect(item.result_trajectory_id).toBe(item.id)
    }
    expect(failedItems[0].error?.code).toBe('INSUFFICIENT_BLE_BEACONS')

    // 6. 比較用 map-data:batch API による複数軌跡の一括取得
    const successfulTrajectoryIds = completedItems.map((i) => i.id)
    const batchResponse = await app.request('/api/trajectories/map-data:batch', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data_type: 'analyzed',
        trajectory_ids: successfulTrajectoryIds,
      }),
    })

    expect(batchResponse.status).toBe(200)
    const batchJson = (await batchResponse.json()) as {
      floor_id: string
      trajectories: {
        trajectory_id: string
        data_type: string
        points: { timestamp: number; x: number; y: number }[]
      }[]
    }

    expect(batchJson.floor_id).toBe(floorId)
    expect(batchJson.trajectories).toHaveLength(3)

    for (const traj of batchJson.trajectories) {
      expect(successfulTrajectoryIds).toContain(traj.trajectory_id)
      expect(traj.data_type).toBe('analyzed')
      expect(traj.points).toHaveLength(3)
      expect(traj.points[0]).toEqual({ timestamp: 0, x: 10.0, y: 20.0 })
      expect(traj.points[1]).toEqual({ timestamp: 1, x: 11.5, y: 21.5 })
      expect(traj.points[2]).toEqual({ timestamp: 2, x: 13.0, y: 23.0 })
    }

    // 7. Trajectory API からの実行メタデータ取得の検証 (Issue #257)
    const singleTrajRes = await app.request(`/api/trajectories/${successfulTrajectoryIds[0]}`, {
      headers: authHeaders,
    })
    expect(singleTrajRes.status).toBe(200)
    const singleTrajJson = (await singleTrajRes.json()) as {
      trajectory_id: string
      status: string
      execution: {
        analysis_run_id: string
        analysis_run_item_id: string
        pipeline_id: string
        parameters: Record<string, unknown>
        inputs: Record<string, unknown> | null
        executed_at: string
      }
    }
    expect(singleTrajJson.trajectory_id).toBe(successfulTrajectoryIds[0])
    expect(singleTrajJson.status).toBe('completed')
    expect(singleTrajJson.execution).toBeDefined()
    expect(singleTrajJson.execution.analysis_run_id).toBe(runId)
    expect(singleTrajJson.execution.analysis_run_item_id).toBe(successfulTrajectoryIds[0])
    expect(['pdr', 'pdr-ble']).toContain(singleTrajJson.execution.pipeline_id)
    expect(singleTrajJson.execution.executed_at).toBeTruthy()
  }, 30000)
})
