-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY trajectories_recording_created_at_id_active_idx
  ON trajectories (recording_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS trajectories_recording_created_at_id_active_idx;
