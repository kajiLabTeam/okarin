import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  findAnalysisRunById,
  insertAnalysisRun,
  insertAnalysisRunTrajectories,
  listAnalysisRunTrajectories,
  markAnalysisRunCompleted,
  markAnalysisRunFailed,
  markAnalysisRunProcessing,
  markTimedOutAnalysisRunsFailed,
} from '../../../src/services/analysis-runs/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { insertTrajectory } from '../../../src/services/trajectories/index.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()

describe('analysis run repository', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('runと入力trajectoryを順序付きで保存できる', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db)
    const trajectories = await Promise.all(
      [0, 1].map(() =>
        insertTrajectory(
          {
            recording_id: recording.id,
            floor_id: floor.id,
            organization_id: organization.id,
            status: 'completed',
          },
          db
        )
      )
    )
    const run = await insertAnalysisRun(
      {
        organization_id: organization.id,
        floor_id: floor.id,
        analysis_type: 'stay_heatmap',
        parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
        definition_version: 'original-v1',
      },
      db
    )

    await insertAnalysisRunTrajectories(
      [
        { analysis_run_id: run.id, trajectory_id: trajectories[1].id, seq: 1 },
        { analysis_run_id: run.id, trajectory_id: trajectories[0].id, seq: 0 },
      ],
      db
    )

    const storedRun = await findAnalysisRunById(run.id, db)
    const inputs = await listAnalysisRunTrajectories(run.id, db)

    expect(storedRun).toMatchObject({
      status: 'accepted',
      parameters: { speed_threshold_mps: 0.5, grid_size_m: 1 },
      error_code: null,
      started_at: null,
      finished_at: null,
    })
    expect(inputs.map(({ trajectory_id, seq }) => ({ trajectory_id, seq }))).toEqual([
      { trajectory_id: trajectories[0].id, seq: 0 },
      { trajectory_id: trajectories[1].id, seq: 1 },
    ])
  })

  it('acceptedからprocessingを経てcompletedへ更新できる', async () => {
    const { floor, organization } = await createRecordingFixture(db)
    const run = await insertAnalysisRun(
      {
        organization_id: organization.id,
        floor_id: floor.id,
        analysis_type: 'stay_heatmap',
        parameters: {},
        definition_version: 'original-v1',
      },
      db
    )
    const startedAt = new Date('2026-08-04T01:00:00.000Z')
    const finishedAt = new Date('2026-08-04T01:01:00.000Z')

    const processing = await markAnalysisRunProcessing(run.id, startedAt, db)
    const completed = await markAnalysisRunCompleted(run.id, finishedAt, db)
    const failed = await markAnalysisRunFailed(run.id, 'ANALYSIS_PROCESSING_FAILED', finishedAt, db)

    expect(processing).toMatchObject({ status: 'processing', started_at: startedAt })
    expect(completed).toMatchObject({ status: 'completed', finished_at: finishedAt })
    expect(failed).toBeUndefined()
  })

  it('acceptedからfailedへ更新し終端状態から遷移しない', async () => {
    const { floor, organization } = await createRecordingFixture(db)
    const run = await insertAnalysisRun(
      {
        organization_id: organization.id,
        floor_id: floor.id,
        analysis_type: 'stay_heatmap',
        parameters: {},
        definition_version: 'original-v1',
      },
      db
    )
    const finishedAt = new Date('2026-08-04T01:01:00.000Z')

    const failed = await markAnalysisRunFailed(
      run.id,
      'ANALYSIS_PREPARATION_FAILED',
      finishedAt,
      db
    )
    const processing = await markAnalysisRunProcessing(run.id, finishedAt, db)

    expect(failed).toMatchObject({
      status: 'failed',
      error_code: 'ANALYSIS_PREPARATION_FAILED',
      started_at: null,
      finished_at: finishedAt,
    })
    expect(processing).toBeUndefined()
  })

  it('同じrun内でtrajectoryとseqを重複できない', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db)
    const [trajectory, anotherTrajectory] = await Promise.all(
      [0, 1].map(() =>
        insertTrajectory(
          {
            recording_id: recording.id,
            floor_id: floor.id,
            organization_id: organization.id,
            status: 'completed',
          },
          db
        )
      )
    )
    const run = await insertAnalysisRun(
      {
        organization_id: organization.id,
        floor_id: floor.id,
        analysis_type: 'stay_heatmap',
        parameters: {},
        definition_version: 'original-v1',
      },
      db
    )

    await insertAnalysisRunTrajectories(
      [{ analysis_run_id: run.id, trajectory_id: trajectory.id, seq: 0 }],
      db
    )

    await expect(
      insertAnalysisRunTrajectories(
        [{ analysis_run_id: run.id, trajectory_id: trajectory.id, seq: 1 }],
        db
      )
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertAnalysisRunTrajectories(
        [{ analysis_run_id: run.id, trajectory_id: anotherTrajectory.id, seq: 0 }],
        db
      )
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('期限超過したacceptedとprocessingだけをfailedへ更新する', async () => {
    const { floor, organization } = await createRecordingFixture(db)
    const deadlineAt = new Date('2026-08-04T01:00:00.000Z')
    const futureDeadlineAt = new Date('2026-08-04T03:00:00.000Z')
    const now = new Date('2026-08-04T02:00:00.000Z')
    const createRun = (deadline_at: Date) =>
      insertAnalysisRun(
        {
          organization_id: organization.id,
          floor_id: floor.id,
          analysis_type: 'stay_heatmap',
          parameters: {},
          definition_version: 'original-v1',
          deadline_at,
        },
        db
      )
    const [accepted, processing, future, completed] = await Promise.all([
      createRun(deadlineAt),
      createRun(deadlineAt),
      createRun(futureDeadlineAt),
      createRun(deadlineAt),
    ])
    await markAnalysisRunProcessing(processing.id, new Date('2026-08-04T00:30:00.000Z'), db)
    await markAnalysisRunProcessing(completed.id, new Date('2026-08-04T00:30:00.000Z'), db)
    await markAnalysisRunCompleted(completed.id, new Date('2026-08-04T00:45:00.000Z'), db)

    const expiredCount = await markTimedOutAnalysisRunsFailed(now, db)
    const [expiredAccepted, expiredProcessing, activeFuture, terminalCompleted] = await Promise.all(
      [
        findAnalysisRunById(accepted.id, db),
        findAnalysisRunById(processing.id, db),
        findAnalysisRunById(future.id, db),
        findAnalysisRunById(completed.id, db),
      ]
    )

    expect(expiredCount).toBe(2)
    expect(expiredAccepted).toMatchObject({
      status: 'failed',
      error_code: 'ANALYSIS_TIMEOUT',
      finished_at: now,
    })
    expect(expiredProcessing).toMatchObject({
      status: 'failed',
      error_code: 'ANALYSIS_TIMEOUT',
      finished_at: now,
    })
    expect(activeFuture).toMatchObject({ status: 'accepted', finished_at: null })
    expect(terminalCompleted).toMatchObject({ status: 'completed' })
  })
})
