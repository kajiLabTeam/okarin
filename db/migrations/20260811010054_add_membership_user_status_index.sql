-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY organization_memberships_user_status_idx
  ON organization_memberships (user_id, status);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_user_status_idx;
