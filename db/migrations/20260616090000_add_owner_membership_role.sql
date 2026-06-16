-- migrate:up

ALTER TABLE organization_memberships
  DROP CONSTRAINT organization_memberships_role_chk;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_role_chk
  CHECK (role IN ('member', 'manager', 'owner'));

-- migrate:down

ALTER TABLE organization_memberships
  DROP CONSTRAINT organization_memberships_role_chk;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_role_chk
  CHECK (role IN ('member', 'manager'));
