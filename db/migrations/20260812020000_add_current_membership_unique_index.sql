-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY organization_memberships_current_user_org_key
  ON organization_memberships (organization_id, user_id)
  WHERE status IN ('active', 'suspended');

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_current_user_org_key;
