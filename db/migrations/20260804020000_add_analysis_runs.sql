-- migrate:up

CREATE TABLE analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  floor_id uuid NOT NULL REFERENCES floors(id),
  analysis_type text NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  parameters jsonb NOT NULL,
  definition_version text NOT NULL,
  error_code text,
  started_at timestamptz,
  deadline_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_runs_analysis_type_nonempty_chk CHECK (length(btrim(analysis_type)) > 0),
  CONSTRAINT analysis_runs_definition_version_nonempty_chk
    CHECK (length(btrim(definition_version)) > 0),
  CONSTRAINT analysis_runs_parameters_object_chk CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT analysis_runs_status_chk
    CHECK (status IN ('accepted', 'processing', 'completed', 'failed')),
  CONSTRAINT analysis_runs_state_chk CHECK (
    (status = 'accepted' AND started_at IS NULL AND finished_at IS NULL AND error_code IS NULL)
    OR (
      status = 'processing'
      AND started_at IS NOT NULL
      AND finished_at IS NULL
      AND error_code IS NULL
    )
    OR (
      status = 'completed'
      AND started_at IS NOT NULL
      AND finished_at IS NOT NULL
      AND error_code IS NULL
    )
    OR (
      status = 'failed'
      AND finished_at IS NOT NULL
      AND length(btrim(error_code)) > 0
    )
  )
);

CREATE INDEX analysis_runs_organization_created_at_id_idx
  ON analysis_runs (organization_id, created_at DESC, id DESC);

CREATE TABLE analysis_run_trajectories (
  analysis_run_id uuid NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  trajectory_id uuid NOT NULL REFERENCES trajectories(id),
  seq integer NOT NULL CHECK (seq >= 0),
  PRIMARY KEY (analysis_run_id, trajectory_id),
  UNIQUE (analysis_run_id, seq)
);

CREATE INDEX analysis_run_trajectories_trajectory_id_idx
  ON analysis_run_trajectories (trajectory_id);

-- migrate:down

DROP TABLE analysis_run_trajectories;
DROP TABLE analysis_runs;
