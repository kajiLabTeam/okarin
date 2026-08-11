-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY organization_memberships_id_organization_key
  ON organization_memberships (id, organization_id);

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS organization_memberships_id_organization_key;
