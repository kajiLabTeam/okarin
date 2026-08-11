-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY sessions_active_user_idx
  ON sessions (user_id)
  WHERE revoked_at IS NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS sessions_active_user_idx;
