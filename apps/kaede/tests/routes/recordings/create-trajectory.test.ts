import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createTrajectoryResponseSchema } from '../../../src/schemas/trajectories.js'
import { createApp } from '../../../src/server.js'
import { processOutboxJob } from '../../../src/services/analysis-runs/outbox-worker.js'
import { createDb } from '../../../src/services/db/client.js'
import type * as ExecutionClient from '../../../src/services/nozomi/nozomi-execution-client.js'
import { FatalDispatchError } from '../../../src/services/nozomi/nozomi-execution-client.js'
import type * as PresignedUrl from '../../../src/services/storage/presigned-url.js'
import { updateRecordingConstraints } from '../../../src/usecases/recordings/update-recording-constraints.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const { resolvePipelineMock, dispatchMock, submitAnalyzeRequestMock } = vi.hoisted(() => ({
  resolvePipelineMock: vi.fn(),
  dispatchMock: vi.fn(),
  submitAnalyzeRequestMock: vi.fn(),
}))
vi.mock('../../../src/services/nozomi/pipeline-availability.js', () => ({
  resolvePipelineForExecution: resolvePipelineMock,
}))
vi.mock('../../../src/services/nozomi/nozomi-execution-client.js', async (original) => ({
  ...(await original<typeof ExecutionClient>()),
  dispatchExecutionToNozomi: dispatchMock,
}))
vi.mock('../../../src/services/nozomi/index.js', () => ({
  submitAnalyzeRequest: submitAnalyzeRequestMock,
}))
vi.mock('../../../src/services/storage/presigned-url.js', async (original) => ({
  ...(await original<typeof PresignedUrl>()),
  issueInternalTrajectoryResultUploadUrl: vi
    .fn()
    .mockResolvedValue({ uploadUrl: 'http://storage/result' }),
}))

const db = createDb()
let app: ReturnType<typeof createApp>

const authHeaders = {
  authorization: 'Bearer shared-token',
}

const managerActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'manager@example.test',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    { organization_id: organizationId, organization_name: 'Test Organization', role: 'manager' },
  ],
})

describe('POST /api/recordings/:recordingId/trajectories', () => {
  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    resetRuntimeConfigForTests()
    app = createApp()
    await resetDatabase(db)
    vi.clearAllMocks()
    resolvePipelineMock.mockImplementation(async (_id: string, recordingIds: string[]) => {
      const recording = await db
        .selectFrom('recordings')
        .selectAll()
        .where('id', '=', recordingIds[0])
        .executeTakeFirstOrThrow()
      const revision = await db
        .selectFrom('floor_map_revisions')
        .selectAll()
        .where('id', '=', recording.floor_map_revision_id)
        .executeTakeFirstOrThrow()
      return {
        ok: true,
        value: {
          pipeline: {
            definition: {
              pipeline_id: 'pdr',
              definition_version: '1',
              state: 'active',
              bindings: [],
              parameters_schema: {
                type: 'object',
                properties: { origin_x: {}, origin_y: {}, initial_direction: {}, floor_scale: {} },
              },
            },
            digest: 'a'.repeat(64),
          },
          recordings: [
            {
              recording_id: recording.id,
              bindings: {},
              issues: [],
              assets: [
                {
                  data_asset_id: 'map',
                  data_type: 'resource.floor_map',
                  validation_status: 'valid',
                  object_key: revision.image_object_path,
                  checksum_sha256: 'b'.repeat(64),
                  floor_map_revision_id: revision.id,
                  scale: revision.scale,
                },
              ],
            },
          ],
        },
      }
    })
  })

  afterAll(async () => {
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()
  })

  it('trajectory と constraints を作成し processing を返す', async () => {
    const { organizationId, recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [
          {
            seq: 0,
            point_type: 'start',
            x: 12.34,
            y: 56.78,
            direction: 90,
          },
          {
            seq: 1,
            point_type: 'waypoint',
            x: 18.2,
            y: 60.1,
            relative_timestamp: 12000,
          },
        ],
      }),
    })

    expect(response.status).toBe(201)

    const body = createTrajectoryResponseSchema.parse(await response.json())
    expect(body.recording_id).toBe(recordingId)
    expect(body.organization_id).toBe(organizationId)
    expect(body.status).toBe('processing')

    const created = await db
      .selectFrom('trajectories')
      .selectAll()
      .where('id', '=', body.trajectory_id)
      .executeTakeFirstOrThrow()

    expect(created.recording_id).toBe(recordingId)
    expect(created.organization_id).toBe(organizationId)
    expect(created.status).toBe('processing')
    expect(created.error_code).toBeNull()
    expect(created.error_message).toBeNull()

    expect(created.constraints).toEqual([
      {
        point_type: 'start',
        seq: 0,
        x: 12.34,
        y: 56.78,
        direction: 90,
      },
      {
        point_type: 'waypoint',
        seq: 1,
        x: 18.2,
        y: 60.1,
        relative_timestamp: 12000,
      },
    ])

    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
    const item = await db
      .selectFrom('positioning_analysis_run_items')
      .selectAll()
      .where('id', '=', body.trajectory_id)
      .executeTakeFirstOrThrow()
    expect(item.result_trajectory_id).toBe(body.trajectory_id)
    expect(item.status).toBe('queued')
    expect(item.parameters).toMatchObject({
      origin_x: 12.34,
      origin_y: 56.78,
      initial_direction: 90,
    })
    const jobs = await db.selectFrom('outbox_jobs').selectAll().execute()
    expect(jobs).toHaveLength(1)
  })

  it('body constraints 省略時は recording constraints を snapshot に使う', async () => {
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20, direction: 45 }]
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
      constraints,
    })

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(201)
    const body = createTrajectoryResponseSchema.parse(await response.json())
    const created = await db
      .selectFrom('trajectories')
      .select(['constraints'])
      .where('id', '=', body.trajectory_id)
      .executeTakeFirstOrThrow()
    expect(created.constraints).toEqual(constraints)
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })

  it('body constraints が空配列なら recording constraints を使用しない', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
      constraints: [{ seq: 0, point_type: 'start', x: 10, y: 20 }],
    })

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ constraints: [] }),
    })

    expect(response.status).toBe(201)
    const body = createTrajectoryResponseSchema.parse(await response.json())
    const created = await db
      .selectFrom('trajectories')
      .select(['constraints'])
      .where('id', '=', body.trajectory_id)
      .executeTakeFirstOrThrow()
    expect(created.constraints).toEqual([])
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })

  it('fallback の recording constraints が不正なら 500 を返して Nozomi を呼ばない', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })
    await db
      .updateTable('recordings')
      .set({
        constraints: JSON.stringify([{ seq: 1, point_type: 'start', x: 10, y: 20 }]),
      })
      .where('id', '=', recordingId)
      .execute()

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_CONSTRAINTS_INVALID',
      error_message: 'recording constraints contain invalid values',
      details: { recording_id: recordingId },
    })
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
    const trajectories = await db
      .selectFrom('trajectories')
      .select(['id'])
      .where('recording_id', '=', recordingId)
      .execute()
    expect(trajectories).toEqual([])
  })

  it('recording constraints 更新後も既存 snapshot は変わらず次回作成から反映する', async () => {
    const initialConstraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]
    const updatedConstraints = [{ seq: 0, point_type: 'start' as const, x: 30, y: 40 }]
    const { organizationId, recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
      constraints: initialConstraints,
    })

    const firstResponse = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const first = createTrajectoryResponseSchema.parse(await firstResponse.json())

    await expect(
      updateRecordingConstraints(
        managerActor(organizationId),
        { recordingId },
        { constraints: updatedConstraints }
      )
    ).resolves.toMatchObject({ ok: true })

    const secondResponse = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const second = createTrajectoryResponseSchema.parse(await secondResponse.json())

    const snapshots = await db
      .selectFrom('trajectories')
      .select(['id', 'constraints'])
      .where('id', 'in', [first.trajectory_id, second.trajectory_id])
      .execute()
    expect(snapshots.find(({ id }) => id === first.trajectory_id)?.constraints).toEqual(
      initialConstraints
    )
    expect(snapshots.find(({ id }) => id === second.trajectory_id)?.constraints).toEqual(
      updatedConstraints
    )
  })

  it('ready でない recording は 409 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro'],
    })

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_NOT_READY',
      error_message: 'recording is not ready for trajectory creation',
      details: {
        recording_id: recordingId,
        upload_status: 'accepted',
      },
    })
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
  })

  it('配送失敗は非同期に既存の軌跡IDへ反映し、旧経路を実行しない', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'ready',
      uploadTargets: ['acce', 'gyro'],
    })

    dispatchMock.mockRejectedValue(new FatalDispatchError('upstream failure'))

    const response = await app.request(`/api/recordings/${recordingId}/trajectories`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        constraints: [],
      }),
    })

    expect(response.status).toBe(201)
    const body = createTrajectoryResponseSchema.parse(await response.json())
    const job = await db.selectFrom('outbox_jobs').selectAll().executeTakeFirstOrThrow()
    await processOutboxJob(job)
    expect(submitAnalyzeRequestMock).not.toHaveBeenCalled()
    expect(dispatchMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ analysis_run_item_id: body.trajectory_id })
    )

    const created = await db
      .selectFrom('trajectories')
      .selectAll()
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow()

    expect(created.recording_id).toBe(recordingId)
    expect(created.status).toBe('failed')
    expect(created.error_code).toBe('NOZOMI_REQUEST_FAILED')
    expect(created.error_message).toBe('upstream failure')
    expect(created.failed_at).not.toBeNull()
  })
})
