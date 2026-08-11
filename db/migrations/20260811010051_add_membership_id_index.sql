-- migrate:up transaction:false

-- Keep this as a standalone unique index so the Backfill PR can promote it with
-- ADD PRIMARY KEY USING INDEX without rebuilding it.
CREATE UNIQUE INDEX CONCURRENTLY organization_memberships_id_key
  ON organization_memberships (id);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_id_key;
