-- migrate:up

ALTER TABLE recordings
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE trajectories
  ADD COLUMN deleted_at timestamptz;

DROP INDEX IF EXISTS recordings_pedestrian_id_created_at_idx;
DROP INDEX IF EXISTS recordings_floor_id_created_at_idx;
DROP INDEX IF EXISTS trajectories_recording_id_created_at_idx;
DROP INDEX IF EXISTS trajectories_status_created_at_idx;

CREATE INDEX recordings_pedestrian_id_created_at_active_idx
  ON recordings (pedestrian_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX recordings_floor_id_created_at_active_idx
  ON recordings (floor_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX trajectories_recording_id_created_at_active_idx
  ON trajectories (recording_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX trajectories_status_created_at_active_idx
  ON trajectories (status, created_at DESC)
  WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS trajectories_status_created_at_active_idx;
DROP INDEX IF EXISTS trajectories_recording_id_created_at_active_idx;
DROP INDEX IF EXISTS recordings_floor_id_created_at_active_idx;
DROP INDEX IF EXISTS recordings_pedestrian_id_created_at_active_idx;

CREATE INDEX recordings_pedestrian_id_created_at_idx
  ON recordings (pedestrian_id, created_at DESC);

CREATE INDEX recordings_floor_id_created_at_idx
  ON recordings (floor_id, created_at DESC);

CREATE INDEX trajectories_recording_id_created_at_idx
  ON trajectories (recording_id, created_at DESC);

CREATE INDEX trajectories_status_created_at_idx
  ON trajectories (status, created_at DESC);

ALTER TABLE trajectories
  DROP COLUMN deleted_at;

ALTER TABLE recordings
  DROP COLUMN deleted_at;
