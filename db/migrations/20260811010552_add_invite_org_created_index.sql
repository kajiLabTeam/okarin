-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY organization_invites_org_created_at_idx
  ON organization_invites (organization_id, created_at DESC);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_invites_org_created_at_idx;
