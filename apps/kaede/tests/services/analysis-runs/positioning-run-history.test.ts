import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildPaginatedResult, decodePaginationCursor } from '../../../src/schemas/pagination.js'
import {
  listOrganizationPositioningRuns,
  insertPositioningRun,
  insertPositioningItems,
} from '../../../src/services/analysis-runs/positioning-analysis-run-repository.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()
beforeEach(async () => {
  await resetDatabase(db)
})
afterAll(async () => {
  await db.destroy()
})
async function seedRun(
  organizationId: string,
  recordingId: string,
  states: string[],
  video = false
) {
  const run = await insertPositioningRun(
    {
      organization_id: organizationId,
      status: 'accepted',
      idempotency_key: crypto.randomUUID(),
      request_digest: 'a'.repeat(64),
      retry_of_run_id: null,
    },
    db
  )
  const recording = await db
    .selectFrom('recordings')
    .select('floor_id')
    .where('id', '=', recordingId)
    .executeTakeFirstOrThrow()
  const items = await Promise.all(
    states.map(async (status, index) => {
      const trajectory =
        status === 'completed'
          ? await db
              .insertInto('trajectories')
              .values({
                recording_id: recordingId,
                organization_id: organizationId,
                floor_id: recording.floor_id,
                status: 'completed',
              })
              .returning('id')
              .executeTakeFirstOrThrow()
          : null
      return {
        analysis_run_id: run.id,
        recording_id: recordingId,
        pipeline_id: index === 0 ? 'pdr' : 'pdr-particle-filter',
        status,
        slot_bindings: {},
        result_trajectory_id: trajectory?.id ?? null,
        error: status === 'failed' ? { code: 'FAILED', message: 'test failure' } : null,
        pipeline_snapshot: {},
        pipeline_digest: 'a'.repeat(64),
        pipeline_version: '1',
        parameters: {},
        input_manifest: {},
        output_manifest: JSON.stringify(
          video
            ? {
                schema_version: '1',
                artifacts: { particle_animation: { generation_status: 'processing' } },
              }
            : {}
        ),
      }
    })
  )
  if (items.length) await insertPositioningItems(items, db)

  return run
}

describe('positioning run history', () => {
  it('組織を分離し、子処理から進捗・フィルター・動画の状態を集計する', async () => {
    const a = await createRecordingFixture(db)
    const b = await createRecordingFixture(db)
    const active = await seedRun(a.organization.id, a.recording.id, ['queued', 'processing'])
    const done = await seedRun(a.organization.id, a.recording.id, ['completed'], true)
    const partial = await seedRun(a.organization.id, a.recording.id, ['completed', 'failed'])
    await seedRun(b.organization.id, b.recording.id, ['queued'])
    const all = await listOrganizationPositioningRuns(
      a.organization.id,
      { limit: 20, cursor: null, filter: 'all' },
      db
    )
    expect(all.totalCount).toBe(3)
    expect(all.inProgressCount).toBe(1)
    expect(all.rows.find((row) => row.id === active.id)).toMatchObject({
      total: 2,
      queued: 1,
      processing: 1,
      recording_count: 1,
      pipeline_ids: ['pdr', 'pdr-particle-filter'],
    })
    expect(all.rows.find((row) => row.id === done.id)).toMatchObject({
      completed: 1,
      video_processing: 1,
    })
    const running = await listOrganizationPositioningRuns(
      a.organization.id,
      { limit: 20, cursor: null, filter: 'in_progress' },
      db
    )
    expect(running.rows.map((row) => row.id)).toEqual([active.id])
    const failed = await listOrganizationPositioningRuns(
      a.organization.id,
      { limit: 20, cursor: null, filter: 'failed' },
      db
    )
    expect(failed.rows.map((row) => row.id)).toEqual([partial.id])
    expect(failed.inProgressCount).toBe(1)
  })
  it('同じ作成時刻の履歴を重複・欠落なくページ送りする', async () => {
    const a = await createRecordingFixture(db)
    const first = await seedRun(a.organization.id, a.recording.id, [])
    const second = await seedRun(a.organization.id, a.recording.id, [])
    await db
      .updateTable('positioning_analysis_runs')
      .set({ created_at: sql`'2026-11-10T01:00:00.123456Z'::timestamptz` })
      .execute()
    const page = await listOrganizationPositioningRuns(
      a.organization.id,
      { limit: 1, cursor: null, filter: 'all' },
      db
    )
    const result = buildPaginatedResult(page.rows, 1, page.totalCount)
    expect(result.nextCursor).toBeTruthy()
    if (!result.nextCursor) throw new Error('expected another history page')
    const decoded = decodePaginationCursor(result.nextCursor)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const next = await listOrganizationPositioningRuns(
      a.organization.id,
      { limit: 1, cursor: decoded.value, filter: 'all' },
      db
    )
    expect(new Set([result.items[0].id, next.rows[0].id])).toEqual(new Set([first.id, second.id]))
    expect(page.inProgressCount).toBe(2)
  })
})
