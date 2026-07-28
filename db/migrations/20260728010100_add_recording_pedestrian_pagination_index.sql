-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY recordings_pedestrian_created_at_id_active_idx
  ON recordings (pedestrian_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS recordings_pedestrian_created_at_id_active_idx;
