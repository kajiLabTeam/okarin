-- migrate:up
ALTER TABLE positioning_analysis_run_items
  ADD COLUMN output_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE positioning_analysis_run_items
  ADD CONSTRAINT positioning_analysis_run_items_output_manifest_chk
  CHECK (jsonb_typeof(output_manifest) = 'object');

-- migrate:down
ALTER TABLE positioning_analysis_run_items
  DROP CONSTRAINT positioning_analysis_run_items_output_manifest_chk;

ALTER TABLE positioning_analysis_run_items
  DROP COLUMN output_manifest;
