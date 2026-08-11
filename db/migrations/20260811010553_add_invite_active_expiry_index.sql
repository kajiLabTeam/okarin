-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY organization_invites_active_expires_at_idx
  ON organization_invites (expires_at)
  WHERE revoked_at IS NULL AND redeemed_at IS NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_invites_active_expires_at_idx;
