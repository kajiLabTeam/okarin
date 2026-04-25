-- migrate:up

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  level integer NOT NULL,
  name text NOT NULL,
  image_object_path text NOT NULL,
  scale double precision,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT floors_image_object_path_format_chk
    CHECK (image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$')
);

CREATE TABLE pedestrians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  height double precision,
  stride_length double precision,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedestrian_id uuid NOT NULL REFERENCES pedestrians(id) ON DELETE RESTRICT,
  floor_id uuid NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  upload_status text NOT NULL DEFAULT 'accepted',
  upload_targets text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT recordings_upload_status_chk
    CHECK (upload_status IN ('accepted', 'ready', 'failed')),
  CONSTRAINT recordings_upload_targets_nonempty_chk
    CHECK (cardinality(upload_targets) >= 1)
);

CREATE TABLE trajectories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES recordings(id) ON DELETE RESTRICT,
  floor_id uuid NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'accepted',
  error_code text,
  error_message text,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT trajectories_status_chk
    CHECK (status IN ('accepted', 'processing', 'completed', 'failed')),
  CONSTRAINT trajectories_failed_at_chk
    CHECK (
      (status = 'failed' AND failed_at IS NOT NULL) OR
      (status <> 'failed' AND failed_at IS NULL)
    )
);

CREATE TABLE trajectory_constraints (
  trajectory_id uuid NOT NULL REFERENCES trajectories(id) ON DELETE RESTRICT,
  seq integer NOT NULL,
  point_type text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  direction double precision,
  relative_timestamp integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trajectory_id, seq),
  CONSTRAINT trajectory_constraints_seq_chk
    CHECK (seq >= 0),
  CONSTRAINT trajectory_constraints_point_type_chk
    CHECK (point_type IN ('start', 'waypoint', 'goal')),
  CONSTRAINT trajectory_constraints_relative_timestamp_chk
    CHECK (
      relative_timestamp IS NULL OR
      relative_timestamp >= 0
    ),
  CONSTRAINT trajectory_constraints_point_type_timestamp_chk
    CHECK (
      (point_type = 'waypoint' AND relative_timestamp IS NOT NULL) OR
      (point_type IN ('start', 'goal') AND relative_timestamp IS NULL)
    )
);

CREATE INDEX floors_building_id_idx
  ON floors (building_id);

CREATE INDEX recordings_pedestrian_id_created_at_idx
  ON recordings (pedestrian_id, created_at DESC);

CREATE INDEX recordings_floor_id_created_at_idx
  ON recordings (floor_id, created_at DESC);

CREATE INDEX trajectories_recording_id_created_at_idx
  ON trajectories (recording_id, created_at DESC);

CREATE INDEX trajectories_status_created_at_idx
  ON trajectories (status, created_at DESC);

CREATE INDEX trajectory_constraints_trajectory_id_seq_idx
  ON trajectory_constraints (trajectory_id, seq);

CREATE TRIGGER set_updated_at_buildings
BEFORE UPDATE ON buildings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_floors
BEFORE UPDATE ON floors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_pedestrians
BEFORE UPDATE ON pedestrians
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_recordings
BEFORE UPDATE ON recordings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_trajectories
BEFORE UPDATE ON trajectories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_trajectory_constraints
BEFORE UPDATE ON trajectory_constraints
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_trajectory_constraints ON trajectory_constraints;
DROP TRIGGER IF EXISTS set_updated_at_trajectories ON trajectories;
DROP TRIGGER IF EXISTS set_updated_at_recordings ON recordings;
DROP TRIGGER IF EXISTS set_updated_at_pedestrians ON pedestrians;
DROP TRIGGER IF EXISTS set_updated_at_floors ON floors;
DROP TRIGGER IF EXISTS set_updated_at_buildings ON buildings;

DROP INDEX IF EXISTS trajectory_constraints_trajectory_id_seq_idx;
DROP INDEX IF EXISTS trajectories_status_created_at_idx;
DROP INDEX IF EXISTS trajectories_recording_id_created_at_idx;
DROP INDEX IF EXISTS recordings_floor_id_created_at_idx;
DROP INDEX IF EXISTS recordings_pedestrian_id_created_at_idx;
DROP INDEX IF EXISTS floors_building_id_idx;

DROP TABLE IF EXISTS trajectory_constraints;
DROP TABLE IF EXISTS trajectories;
DROP TABLE IF EXISTS recordings;
DROP TABLE IF EXISTS pedestrians;
DROP TABLE IF EXISTS floors;
DROP TABLE IF EXISTS buildings;

DROP FUNCTION IF EXISTS set_updated_at();
