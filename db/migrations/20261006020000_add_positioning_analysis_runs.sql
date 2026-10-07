-- migrate:up
CREATE TABLE positioning_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'accepted',
  idempotency_key text NOT NULL,
  request_digest text NOT NULL,
  retry_of_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positioning_analysis_runs_status_chk CHECK (status IN ('accepted','processing','completed','partially_completed','failed')),
  CONSTRAINT positioning_analysis_runs_idempotency_key_chk CHECK (length(btrim(idempotency_key)) > 0),
  UNIQUE (organization_id, idempotency_key)
);
CREATE UNIQUE INDEX positioning_analysis_runs_id_organization_key ON positioning_analysis_runs (id, organization_id);
ALTER TABLE positioning_analysis_runs ADD CONSTRAINT positioning_analysis_runs_retry_same_org_fk
  FOREIGN KEY (retry_of_run_id, organization_id) REFERENCES positioning_analysis_runs (id, organization_id);
CREATE INDEX positioning_analysis_runs_org_created_idx ON positioning_analysis_runs (organization_id, created_at DESC, id DESC);

CREATE TABLE positioning_analysis_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL REFERENCES positioning_analysis_runs(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL REFERENCES recordings(id),
  pipeline_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  slot_bindings jsonb NOT NULL,
  pipeline_snapshot jsonb NOT NULL,
  pipeline_digest text NOT NULL,
  pipeline_version text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_manifest jsonb NOT NULL,
  result_trajectory_id uuid REFERENCES trajectories(id),
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positioning_analysis_run_items_status_chk CHECK (status IN ('queued','processing','completed','failed')),
  CONSTRAINT positioning_analysis_run_items_state_chk CHECK (
    (status IN ('queued','processing') AND result_trajectory_id IS NULL AND error IS NULL)
    OR (status = 'completed' AND result_trajectory_id IS NOT NULL AND error IS NULL)
    OR (status = 'failed' AND result_trajectory_id IS NULL AND error IS NOT NULL AND jsonb_typeof(error) = 'object')
  ),
  CONSTRAINT positioning_analysis_run_items_json_chk CHECK (jsonb_typeof(slot_bindings) = 'object' AND jsonb_typeof(pipeline_snapshot) = 'object' AND jsonb_typeof(parameters) = 'object' AND jsonb_typeof(input_manifest) = 'object'),
  UNIQUE (analysis_run_id, recording_id, pipeline_id)
);
CREATE INDEX positioning_analysis_run_items_run_idx ON positioning_analysis_run_items (analysis_run_id, created_at, id);
CREATE INDEX positioning_analysis_run_items_queued_claim_idx ON positioning_analysis_run_items (status, created_at, id) WHERE status = 'queued';

-- migrate:down
DROP TABLE positioning_analysis_run_items;
DROP TABLE positioning_analysis_runs;
