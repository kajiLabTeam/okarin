-- migrate:up transaction:false

CREATE INDEX CONCURRENTLY organization_memberships_org_status_role_idx
  ON organization_memberships (organization_id, status, role);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_org_status_role_idx;
