-- migrate:up
-- The legacy API exposes a trajectory ID before asynchronous execution. Only
-- that compatibility path may link a queued/failed item to its existing ID.
ALTER TABLE positioning_analysis_run_items DROP CONSTRAINT positioning_analysis_run_items_state_chk;
ALTER TABLE positioning_analysis_run_items ADD CONSTRAINT positioning_analysis_run_items_state_chk CHECK (
  (status IN ('queued', 'processing') AND error IS NULL AND (
    result_trajectory_id IS NULL OR (
      result_trajectory_id = id AND COALESCE(input_manifest->'__legacy_trajectory__'->>'version' = '1', false)
    )
  ))
  OR (status = 'completed' AND result_trajectory_id IS NOT NULL AND error IS NULL)
  OR (status = 'failed' AND error IS NOT NULL AND jsonb_typeof(error) = 'object' AND (
    result_trajectory_id IS NULL OR (
      result_trajectory_id = id AND COALESCE(input_manifest->'__legacy_trajectory__'->>'version' = '1', false)
    )
  ))
);

-- migrate:down
-- Refuse rollback while new legacy items need their early trajectory links.
ALTER TABLE positioning_analysis_run_items DROP CONSTRAINT positioning_analysis_run_items_state_chk;
ALTER TABLE positioning_analysis_run_items ADD CONSTRAINT positioning_analysis_run_items_state_chk CHECK (
  (status IN ('queued', 'processing') AND result_trajectory_id IS NULL AND error IS NULL)
  OR (status = 'completed' AND result_trajectory_id IS NOT NULL AND error IS NULL)
  OR (status = 'failed' AND result_trajectory_id IS NULL AND error IS NOT NULL AND jsonb_typeof(error) = 'object')
);
