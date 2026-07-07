-- migrate:up

ALTER TABLE recordings
ADD COLUMN constraints jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE recordings
ADD CONSTRAINT recordings_constraints_array_check
CHECK (jsonb_typeof(constraints) = 'array');

ALTER TABLE trajectories
ADD COLUMN constraints jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE trajectories
ADD CONSTRAINT trajectories_constraints_array_check
CHECK (jsonb_typeof(constraints) = 'array');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trajectory_constraints LIMIT 1) THEN
    RAISE EXCEPTION 'trajectory_constraints is not empty';
  END IF;
END $$;

DROP TABLE trajectory_constraints;

-- migrate:down

-- This recreates the legacy table structure, but data removed by the up migration
-- cannot be restored from trajectory_constraints.
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

CREATE INDEX trajectory_constraints_trajectory_id_seq_idx
  ON trajectory_constraints (trajectory_id, seq);

CREATE TRIGGER set_updated_at_trajectory_constraints
BEFORE UPDATE ON trajectory_constraints
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE trajectories
DROP COLUMN constraints;

ALTER TABLE recordings
DROP COLUMN constraints;
