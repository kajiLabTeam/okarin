-- migrate:up
CREATE TABLE positioning_analysis_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  analysis_run_item_id uuid NOT NULL REFERENCES positioning_analysis_run_items(id) ON DELETE CASCADE,
  status text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT positioning_analysis_callbacks_status_chk CHECK (status IN ('queued','processing','completed','failed')),
  CONSTRAINT positioning_analysis_callbacks_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX positioning_analysis_callbacks_item_received_idx ON positioning_analysis_callbacks (analysis_run_item_id, received_at);

-- migrate:down
DROP TABLE positioning_analysis_callbacks;
