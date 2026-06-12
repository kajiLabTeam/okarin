import type { Kysely } from 'kysely'
import type { DB } from '../../src/services/db/generated.js'
import { insertTrajectory } from '../../src/services/trajectories/index.js'
import type { TrajectoryStatus } from '../../src/services/trajectories/types.js'
import { createRecordingFixture } from './recordings.js'
import type { CreateRecordingFixtureParams } from './recordings.js'

interface CreateTrajectoryFixtureParams {
  trajectoryStatus?: TrajectoryStatus
  recording?: CreateRecordingFixtureParams
}

export const createTrajectoryFixture = async (
  db: Kysely<DB>,
  params: CreateTrajectoryFixtureParams = {}
) => {
  const { trajectoryStatus = 'processing', recording: recordingParams } = params

  const recordingFixture = await createRecordingFixture(db, {
    uploadStatus: 'ready',
    ...(recordingParams ?? {}),
  })

  const trajectory = await insertTrajectory(
    {
      recording_id: recordingFixture.recording.id,
      floor_id: recordingFixture.floor.id,
      organization_id: recordingFixture.organization.id,
      status: trajectoryStatus,
    },
    db
  )

  return {
    ...recordingFixture,
    trajectoryId: trajectory.id,
    trajectory,
  }
}
