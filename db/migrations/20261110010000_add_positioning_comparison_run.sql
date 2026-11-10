-- migrate:up
ALTER TABLE positioning_analysis_runs
  ADD COLUMN comparison_run_id uuid REFERENCES positioning_analysis_runs(id);

-- migrate:down
ALTER TABLE positioning_analysis_runs DROP COLUMN comparison_run_id;
