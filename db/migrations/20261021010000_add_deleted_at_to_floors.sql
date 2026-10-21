-- migrate:up

ALTER TABLE floors
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX floors_building_id_active_idx
  ON floors (building_id, level, name, id)
  WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS floors_building_id_active_idx;

ALTER TABLE floors
  DROP COLUMN deleted_at;
