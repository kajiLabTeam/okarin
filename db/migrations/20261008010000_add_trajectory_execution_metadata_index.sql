-- migrate:up
CREATE UNIQUE INDEX positioning_analysis_run_items_result_trajectory_id_idx
  ON positioning_analysis_run_items (result_trajectory_id)
  WHERE result_trajectory_id IS NOT NULL;

-- migrate:down
DROP INDEX positioning_analysis_run_items_result_trajectory_id_idx;
