-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY sessions_id_user_key
  ON sessions (id, user_id);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS sessions_id_user_key;
