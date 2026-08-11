-- migrate:up

ALTER TABLE pedestrians
  ADD COLUMN membership_id uuid;

ALTER TABLE pedestrians
  ADD CONSTRAINT pedestrians_membership_organization_fkey
  FOREIGN KEY (membership_id, organization_id)
  REFERENCES organization_memberships(id, organization_id)
  ON DELETE RESTRICT
  NOT VALID;

-- migrate:down

ALTER TABLE pedestrians
  DROP CONSTRAINT IF EXISTS pedestrians_membership_organization_fkey,
  DROP COLUMN IF EXISTS membership_id;
