-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY organization_invites_redeemed_membership_key
  ON organization_invites (redeemed_membership_id);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_invites_redeemed_membership_key;
