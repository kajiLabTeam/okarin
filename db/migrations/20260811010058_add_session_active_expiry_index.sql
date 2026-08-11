-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY sessions_active_expires_at_idx
  ON sessions (expires_at)
  WHERE revoked_at IS NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS sessions_active_expires_at_idx;
