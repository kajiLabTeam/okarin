-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY organization_memberships_id_user_key
  ON organization_memberships (id, user_id);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_id_user_key;
